from calendar import monthrange
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_DOWN, ROUND_HALF_UP
import re

from django.db import transaction
from django.utils import timezone
from rest_framework import exceptions
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import (
    BorrowerAccountRequest,
    BorrowerDocument,
    Loan,
    LoanType,
    Notification,
    Payment,
    PaymentSubmission,
    User,
)
from .payouts import PayoutConfigurationError, PayoutError, PayoutStateError, initiate_loan_disbursement


def normalize_phone_number(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit() or ch == "+")


def normalize_gcash_account_number(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit())
    if digits.startswith("63") and len(digits) == 12:
        return f"0{digits[2:]}"
    if digits.startswith("9") and len(digits) == 10:
        return f"0{digits}"
    return digits


USERNAME_PATTERN = re.compile(r"^[a-z0-9_.-]{3,30}$")
SPECIAL_CHARACTER_PATTERN = re.compile(r"[^A-Za-z0-9]")
REGISTRATION_PASSWORD_MESSAGE = (
    "Password must be at least 8 characters and include at least one number and one special character."
)
PROFILE_PHOTO_ALLOWED_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024
DOCUMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
STRICT_MIN_MONTHLY_INCOME = Decimal("1200.00")
STRICT_MAX_DEBT_TO_INCOME = Decimal("0.45")
DOCUMENT_TYPE_EQUIVALENTS = {
    BorrowerDocument.DocumentType.ID: {
        BorrowerDocument.DocumentType.ID,
        BorrowerDocument.DocumentType.GOVERNMENT_ID,
    },
    BorrowerDocument.DocumentType.GOVERNMENT_ID: {
        BorrowerDocument.DocumentType.GOVERNMENT_ID,
        BorrowerDocument.DocumentType.ID,
    },
}
MONEY_QUANTUM = Decimal("0.01")
STRICT_ELIGIBILITY_DOCUMENT_TYPES = {
    BorrowerDocument.DocumentType.ID,
    BorrowerDocument.DocumentType.GOVERNMENT_ID,
    BorrowerDocument.DocumentType.STUDENT_ID,
    BorrowerDocument.DocumentType.INCOME_PROOF,
    BorrowerDocument.DocumentType.PROOF_OF_REVENUE,
}


def build_media_url(file_field, request=None):
    if not file_field:
        return None

    url = file_field.url
    return request.build_absolute_uri(url) if request else url


def validate_registration_password(value: str) -> str:
    password = value.strip()
    if (
        len(password) < 8
        or not any(character.isdigit() for character in password)
        or not SPECIAL_CHARACTER_PATTERN.search(password)
    ):
        raise serializers.ValidationError(REGISTRATION_PASSWORD_MESSAGE)
    return password


def validate_profile_photo_upload(upload) -> None:
    if not upload:
        return

    content_type = getattr(upload, "content_type", "").lower().strip()
    if content_type and content_type not in PROFILE_PHOTO_ALLOWED_TYPES:
        raise serializers.ValidationError("Profile photo must be a PNG, JPG, or WEBP image.")

    size = getattr(upload, "size", 0)
    if size and size > PROFILE_PHOTO_MAX_BYTES:
        raise serializers.ValidationError("Profile photo must be 5 MB or smaller.")


def rewind_upload(upload) -> None:
    if hasattr(upload, "seek"):
        upload.seek(0)


def document_requirement_is_satisfied(required_document: str, available_document_types) -> bool:
    accepted_types = DOCUMENT_TYPE_EQUIVALENTS.get(required_document, {required_document})
    return any(document_type in accepted_types for document_type in available_document_types)


def get_latest_borrower_document_for_requirement(borrower: User, required_document: str) -> BorrowerDocument | None:
    accepted_types = DOCUMENT_TYPE_EQUIVALENTS.get(required_document, {required_document})
    return (
        BorrowerDocument.objects.filter(borrower=borrower, document_type__in=accepted_types)
        .order_by("-uploaded_at", "-pk")
        .first()
    )


def strict_document_requirement_is_verified(borrower: User, required_document: str) -> bool:
    latest_document = get_latest_borrower_document_for_requirement(borrower, required_document)
    return bool(
        latest_document
        and latest_document.status == BorrowerDocument.VerificationStatus.VERIFIED
    )


def borrower_verification_has_started(borrower: User) -> bool:
    if borrower.employment_status:
        return True
    if borrower.monthly_income is not None:
        return True
    if borrower.monthly_debt is not None:
        return True
    return BorrowerDocument.objects.filter(
        borrower=borrower,
        document_type__in=STRICT_ELIGIBILITY_DOCUMENT_TYPES,
    ).exists()


def coerce_decimal(value, default: str = "0.00") -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value in {None, ""}:
        return Decimal(default)

    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def evaluate_borrower_verification_status(borrower: User) -> str:
    if borrower.role != User.Role.BORROWER:
        return borrower.verification_status or User.VerificationStatus.NOT_STARTED

    if not borrower_verification_has_started(borrower):
        return User.VerificationStatus.NOT_STARTED

    employment_status = borrower.employment_status or ""
    monthly_income = coerce_decimal(borrower.monthly_income)
    monthly_debt = coerce_decimal(borrower.monthly_debt)

    if employment_status not in {
        User.EmploymentStatus.EMPLOYED,
        User.EmploymentStatus.SELF_EMPLOYED,
        User.EmploymentStatus.STUDENT,
    }:
        return User.VerificationStatus.NOT_QUALIFIED

    if monthly_income < STRICT_MIN_MONTHLY_INCOME:
        return User.VerificationStatus.NOT_QUALIFIED

    debt_to_income_ratio = Decimal("1.00") if monthly_income <= 0 else (monthly_debt / monthly_income)
    if debt_to_income_ratio > STRICT_MAX_DEBT_TO_INCOME:
        return User.VerificationStatus.NOT_QUALIFIED

    if not strict_document_requirement_is_verified(borrower, BorrowerDocument.DocumentType.GOVERNMENT_ID):
        return User.VerificationStatus.NOT_QUALIFIED

    if employment_status == User.EmploymentStatus.STUDENT:
        if not strict_document_requirement_is_verified(borrower, BorrowerDocument.DocumentType.STUDENT_ID):
            return User.VerificationStatus.NOT_QUALIFIED
    elif employment_status == User.EmploymentStatus.SELF_EMPLOYED:
        if not strict_document_requirement_is_verified(borrower, BorrowerDocument.DocumentType.PROOF_OF_REVENUE):
            return User.VerificationStatus.NOT_QUALIFIED
    else:
        if not strict_document_requirement_is_verified(borrower, BorrowerDocument.DocumentType.INCOME_PROOF):
            return User.VerificationStatus.NOT_QUALIFIED

    return User.VerificationStatus.QUALIFIED


def refresh_borrower_verification_status(borrower: User) -> str:
    if borrower.role != User.Role.BORROWER:
        return borrower.verification_status or User.VerificationStatus.NOT_STARTED

    next_status = evaluate_borrower_verification_status(borrower)
    next_updated_at = timezone.now().date() if borrower_verification_has_started(borrower) else None
    update_fields = []

    if borrower.verification_status != next_status:
        borrower.verification_status = next_status
        update_fields.append("verification_status")

    if borrower.verification_updated_at != next_updated_at:
        borrower.verification_updated_at = next_updated_at
        update_fields.append("verification_updated_at")

    if update_fields:
        borrower.save(update_fields=update_fields)

    return borrower.verification_status


def validate_borrower_document_upload(document_type: str, file_name: str, upload) -> None:
    normalized_file_name = (file_name or "").strip()
    if not normalized_file_name:
        raise serializers.ValidationError({"file_name": "file_name is required."})

    if not upload:
        raise serializers.ValidationError({"file": "Upload a document file."})

    size = getattr(upload, "size", 0)
    if size and size > DOCUMENT_UPLOAD_MAX_BYTES:
        raise serializers.ValidationError({"file": "Document uploads must be 10 MB or smaller."})


def validate_payment_proof_upload(file_name: str, upload) -> None:
    normalized_file_name = (file_name or "").strip()
    if upload and not normalized_file_name:
        raise serializers.ValidationError({"proof_file_name": "proof_file_name is required when uploading proof."})

    size = getattr(upload, "size", 0)
    if size and size > DOCUMENT_UPLOAD_MAX_BYTES:
        raise serializers.ValidationError({"proof_file": "Payment proof uploads must be 10 MB or smaller."})


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


def format_money(value: Decimal) -> str:
    return str(value.quantize(MONEY_QUANTUM))


def build_repayment_summary(loan: Loan):
    if loan.status != Loan.Status.APPROVED or loan.term_months <= 0:
        return None

    principal = loan.amount.quantize(MONEY_QUANTUM)
    remaining_balance = max(loan.balance, Decimal("0.00")).quantize(MONEY_QUANTUM)
    paid_amount = max(principal - remaining_balance, Decimal("0.00")).quantize(MONEY_QUANTUM)
    scheduled_installment_amount = (principal / Decimal(loan.term_months)).quantize(
        MONEY_QUANTUM,
        rounding=ROUND_HALF_UP,
    )

    if scheduled_installment_amount <= 0:
        return None

    paid_installments = int((paid_amount / scheduled_installment_amount).to_integral_value(rounding=ROUND_DOWN))
    paid_installments = min(loan.term_months, max(0, paid_installments))
    remaining_installments = max(loan.term_months - paid_installments, 0)
    if remaining_balance > 0 and remaining_installments == 0:
        remaining_installments = 1

    repayment_start_date = timezone.localdate(loan.disbursed_at) if loan.disbursed_at else None
    maturity_date = add_months(repayment_start_date, loan.term_months) if repayment_start_date else None
    next_due_date = None
    days_until_due = None
    is_overdue = False
    overdue_installments = 0

    if repayment_start_date and remaining_balance > 0:
        today = timezone.localdate()
        next_installment_number = min(loan.term_months, paid_installments + 1)
        next_due_date = add_months(repayment_start_date, next_installment_number)
        days_until_due = (next_due_date - today).days
        is_overdue = next_due_date < today

        due_installments = 0
        for installment_number in range(1, loan.term_months + 1):
            if add_months(repayment_start_date, installment_number) <= today:
                due_installments = installment_number
                continue
            break
        overdue_installments = max(due_installments - paid_installments, 0)

    return {
        "scheduled_installment_amount": format_money(scheduled_installment_amount),
        "paid_installments": paid_installments,
        "remaining_installments": remaining_installments,
        "total_installments": loan.term_months,
        "repayment_start_date": repayment_start_date.isoformat() if repayment_start_date else None,
        "next_due_date": next_due_date.isoformat() if next_due_date else None,
        "maturity_date": maturity_date.isoformat() if maturity_date else None,
        "days_until_due": days_until_due,
        "is_overdue": is_overdue,
        "overdue_installments": overdue_installments,
    }


class UserSerializer(serializers.ModelSerializer):
    approved_by_name = serializers.CharField(source="approved_by.name", read_only=True, allow_null=True)
    profile_photo_url = serializers.SerializerMethodField()

    def get_profile_photo_url(self, obj):
        return build_media_url(obj.profile_photo, self.context.get("request"))

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "email",
            "profile_photo_url",
            "phone_number",
            "sms_notifications_enabled",
            "gcash_account_name",
            "gcash_account_number",
            "role",
            "is_active",
            "verification_status",
            "verification_updated_at",
            "employment_status",
            "monthly_income",
            "monthly_debt",
            "date_joined",
            "approval_status",
            "approved_at",
            "approved_by",
            "approved_by_name",
            "is_superuser",
        ]


class AdminProvisionedUserCreateSerializer(serializers.ModelSerializer):
    username = serializers.CharField(required=True, allow_blank=False, min_length=3, max_length=30)
    password = serializers.CharField(write_only=True, min_length=6)
    phone_number = serializers.CharField(required=False, allow_blank=True, max_length=30)
    sms_notifications_enabled = serializers.BooleanField(required=False, default=False)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "email",
            "password",
            "phone_number",
            "sms_notifications_enabled",
            "role",
            "is_active",
            "date_joined",
            "approval_status",
            "approved_at",
            "approved_by",
            "is_superuser",
        ]
        read_only_fields = [
            "id",
            "role",
            "is_active",
            "date_joined",
            "approval_status",
            "approved_at",
            "approved_by",
            "is_superuser",
        ]

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "phone_number" not in payload and "phoneNumber" in payload:
            payload["phone_number"] = payload.get("phoneNumber")
        payload.pop("phoneNumber", None)

        if "sms_notifications_enabled" not in payload and "smsNotificationsEnabled" in payload:
            payload["sms_notifications_enabled"] = payload.get("smsNotificationsEnabled")
        payload.pop("smsNotificationsEnabled", None)

        return super().to_internal_value(payload)

    def validate_username(self, value):
        normalized_username = value.strip().lower()
        if not USERNAME_PATTERN.fullmatch(normalized_username):
            raise serializers.ValidationError(
                "Username must be 3-30 characters and use only letters, numbers, dots, underscores, or hyphens."
            )
        if User.objects.filter(username__iexact=normalized_username).exists():
            raise serializers.ValidationError("Username already exists.")
        return normalized_username

    def validate_email(self, value):
        normalized_email = value.lower().strip()
        if User.objects.filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError("Email already exists.")
        return normalized_email

    def validate_password(self, value):
        return value.strip()

    def validate(self, attrs):
        sms_notifications_enabled = attrs.get("sms_notifications_enabled", False)
        phone_number = normalize_phone_number(attrs.get("phone_number", "").strip())
        phone_digits = [ch for ch in phone_number if ch.isdigit()]

        if sms_notifications_enabled and not phone_number:
            raise serializers.ValidationError("phone_number is required when SMS notifications are enabled.")

        if phone_number and len(phone_digits) < 10:
            raise serializers.ValidationError("phone_number must contain at least 10 digits.")

        attrs["phone_number"] = phone_number
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            name=validated_data["name"].strip(),
            phone_number=validated_data.get("phone_number", ""),
            sms_notifications_enabled=validated_data.get("sms_notifications_enabled", False),
            role=User.Role.ADMIN,
            is_active=True,
            is_staff=True,
            is_superuser=False,
            email_verified=True,
            email_verification_code="",
            email_verification_expires_at=None,
            email_verified_at=None,
            approval_status=User.ApprovalStatus.APPROVED,
            approved_at=timezone.now(),
            approved_by=request.user if request and request.user.is_authenticated else None,
        )


class RegisterSerializer(serializers.ModelSerializer):
    username = serializers.CharField(required=True, allow_blank=False, min_length=3, max_length=30)
    password = serializers.CharField(write_only=True, min_length=8)
    phone_number = serializers.CharField(required=True, allow_blank=False, max_length=30)
    sms_notifications_enabled = serializers.BooleanField(required=False, default=False)

    class Meta:
        model = User
        fields = ["username", "name", "email", "password", "phone_number", "sms_notifications_enabled"]

    def validate_username(self, value):
        normalized_username = value.strip().lower()
        if not USERNAME_PATTERN.fullmatch(normalized_username):
            raise serializers.ValidationError(
                "Username must be 3-30 characters and use only letters, numbers, dots, underscores, or hyphens."
            )
        if User.objects.filter(username__iexact=normalized_username).exists():
            raise serializers.ValidationError("Username already exists.")
        return normalized_username

    def validate_email(self, value):
        normalized_email = value.lower().strip()
        if User.objects.filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError("Email already exists.")
        return normalized_email

    def validate_password(self, value):
        return validate_registration_password(value)

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "username" not in payload and "userName" in payload:
            payload["username"] = payload.get("userName")
        payload.pop("userName", None)

        if "phone_number" not in payload and "phoneNumber" in payload:
            payload["phone_number"] = payload.get("phoneNumber")
        payload.pop("phoneNumber", None)

        if "sms_notifications_enabled" not in payload:
            if "smsNotificationsEnabled" in payload:
                payload["sms_notifications_enabled"] = payload.get("smsNotificationsEnabled")
            elif "smsEnabled" in payload:
                payload["sms_notifications_enabled"] = payload.get("smsEnabled")
        payload.pop("smsNotificationsEnabled", None)
        payload.pop("smsEnabled", None)

        return super().to_internal_value(payload)

    def validate(self, attrs):
        phone_number = normalize_phone_number(attrs.get("phone_number", "").strip())
        phone_digits = [ch for ch in phone_number if ch.isdigit()]

        if not phone_number:
            raise serializers.ValidationError("phone_number is required.")

        if len(phone_digits) < 10:
            raise serializers.ValidationError("phone_number must contain at least 10 digits.")

        attrs["phone_number"] = phone_number
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            name=validated_data["name"],
            phone_number=validated_data.get("phone_number", ""),
            sms_notifications_enabled=validated_data.get("sms_notifications_enabled", False),
            email_verified=False,
            email_verification_code="",
            email_verification_expires_at=None,
            email_verified_at=None,
            role=User.Role.BORROWER,
            is_active=True,
            approval_status=User.ApprovalStatus.APPROVED,
            approved_at=timezone.now(),
            approved_by=None,
        )


class SendEmailVerificationCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class VerifyEmailCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=4, max_length=10)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_code(self, value):
        normalized = "".join(ch for ch in value.strip() if ch.isdigit())
        if len(normalized) < 4:
            raise serializers.ValidationError("Verification code must be at least 4 digits.")
        return normalized


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["name"] = user.name
        return token

    def validate(self, attrs):
        normalized_attrs = attrs.copy()
        matched_user = None

        username_field = self.username_field
        if username_field in normalized_attrs and isinstance(normalized_attrs[username_field], str):
            provided_username = normalized_attrs[username_field].strip()
            matched_user = User.objects.filter(username__iexact=provided_username).first()
            normalized_attrs[username_field] = matched_user.username if matched_user else provided_username.lower()

        if "password" in normalized_attrs and isinstance(normalized_attrs["password"], str):
            normalized_attrs["password"] = normalized_attrs["password"].strip()

        provided_password = normalized_attrs.get("password", "")
        if matched_user and isinstance(provided_password, str) and matched_user.check_password(provided_password):
            if not matched_user.email_verified:
                raise exceptions.AuthenticationFailed("Please verify your email to complete registration.")
            if matched_user.approval_status == User.ApprovalStatus.PENDING:
                raise exceptions.AuthenticationFailed("Your account is waiting for super admin approval.")
            if matched_user.approval_status == User.ApprovalStatus.REJECTED:
                raise exceptions.AuthenticationFailed("Your account request was rejected. Contact the super admin.")
            if not matched_user.is_active:
                raise exceptions.AuthenticationFailed("Your account is inactive. Contact the super admin.")

        try:
            data = super().validate(normalized_attrs)
        except exceptions.AuthenticationFailed as exc:
            raise exceptions.AuthenticationFailed("No active account found with the given credentials.") from exc

        if not self.user.email_verified:
            raise exceptions.AuthenticationFailed("Please verify your email to complete registration.")
        if self.user.approval_status == User.ApprovalStatus.PENDING:
            raise exceptions.AuthenticationFailed("Your account is waiting for super admin approval.")
        if self.user.approval_status == User.ApprovalStatus.REJECTED:
            raise exceptions.AuthenticationFailed("Your account request was rejected. Contact the super admin.")

        data["user"] = UserSerializer(self.user, context=self.context).data
        return data


class LoanTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanType
        fields = [
            "id",
            "name",
            "min_amount",
            "max_amount",
            "base_interest_rate",
            "terms_months",
            "required_documents",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        min_amount = attrs.get("min_amount", getattr(self.instance, "min_amount", None))
        max_amount = attrs.get("max_amount", getattr(self.instance, "max_amount", None))
        terms_months = attrs.get("terms_months", getattr(self.instance, "terms_months", []))
        required_documents = attrs.get("required_documents", getattr(self.instance, "required_documents", []))

        if min_amount and max_amount and max_amount < min_amount:
            raise serializers.ValidationError("max_amount must be greater than or equal to min_amount.")

        if not isinstance(terms_months, list) or not terms_months:
            raise serializers.ValidationError("terms_months must contain at least one value.")

        normalized_terms = []
        for term in terms_months:
            if not isinstance(term, int) or term <= 0:
                raise serializers.ValidationError("Each term in terms_months must be a positive integer.")
            normalized_terms.append(term)

        if not isinstance(required_documents, list):
            raise serializers.ValidationError("required_documents must be a list.")

        allowed_document_types = {choice[0] for choice in BorrowerDocument.DocumentType.choices}
        normalized_required_documents = []
        for document_type in required_documents:
            if not isinstance(document_type, str):
                raise serializers.ValidationError("Each required document must be a string value.")

            normalized_document_type = document_type.strip()
            if normalized_document_type not in allowed_document_types:
                raise serializers.ValidationError(
                    f"Unsupported required document: {normalized_document_type}."
                )

            if normalized_document_type not in normalized_required_documents:
                normalized_required_documents.append(normalized_document_type)

        attrs["terms_months"] = sorted(set(normalized_terms))
        attrs["required_documents"] = normalized_required_documents
        return attrs


class LoanSerializer(serializers.ModelSerializer):
    loan_type_name = serializers.CharField(source="loan_type.name", read_only=True)
    borrower_email = serializers.CharField(source="borrower.email", read_only=True)
    borrower_profile_photo_url = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(source="reviewed_by.name", read_only=True)
    payments_count = serializers.SerializerMethodField()
    repayment_summary = serializers.SerializerMethodField()

    def get_payments_count(self, obj):
        return obj.payments.count()

    def get_borrower_profile_photo_url(self, obj):
        return build_media_url(getattr(obj.borrower, "profile_photo", None), self.context.get("request"))

    def get_repayment_summary(self, obj):
        return build_repayment_summary(obj)

    class Meta:
        model = Loan
        fields = [
            "id",
            "borrower",
            "borrower_name",
            "borrower_email",
            "borrower_profile_photo_url",
            "loan_type",
            "loan_type_name",
            "amount",
            "interest_rate",
            "term_months",
            "status",
            "balance",
            "reviewed_by",
            "reviewed_by_name",
            "rejection_reason",
            "application_purpose",
            "applicant_count",
            "contact_email",
            "contact_phone_number",
            "disbursement_method",
            "disbursement_account_name",
            "disbursement_account_number",
            "disbursement_status",
            "disbursement_provider",
            "disbursement_reference",
            "disbursement_external_id",
            "disbursement_provider_status",
            "disbursement_failure_code",
            "disbursement_failure_message",
            "disbursement_requested_at",
            "disbursed_at",
            "payments_count",
            "repayment_summary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "borrower",
            "borrower_name",
            "interest_rate",
            "status",
            "balance",
            "reviewed_by",
            "rejection_reason",
            "application_purpose",
            "applicant_count",
            "contact_email",
            "contact_phone_number",
            "disbursement_status",
            "disbursement_provider",
            "disbursement_reference",
            "disbursement_external_id",
            "disbursement_provider_status",
            "disbursement_failure_code",
            "disbursement_failure_message",
            "disbursement_requested_at",
            "disbursed_at",
            "payments_count",
            "repayment_summary",
            "created_at",
            "updated_at",
        ]


class LoanCreateSerializer(serializers.ModelSerializer):
    applicant_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    application_purpose = serializers.ChoiceField(
        choices=Loan.ApplicationPurpose.choices,
        required=False,
        default=Loan.ApplicationPurpose.PURCHASE,
    )
    applicant_count = serializers.ChoiceField(
        choices=Loan.ApplicantCount.choices,
        required=False,
        default=Loan.ApplicantCount.ONE,
    )
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    contact_phone_number = serializers.CharField(required=False, allow_blank=True, max_length=30)
    disbursement_method = serializers.ChoiceField(
        choices=Loan.DisbursementMethod.choices,
        required=False,
        default=Loan.DisbursementMethod.GCASH,
    )
    disbursement_account_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    disbursement_account_number = serializers.CharField(required=False, allow_blank=True, max_length=120)

    class Meta:
        model = Loan
        fields = [
            "loan_type",
            "amount",
            "term_months",
            "applicant_name",
            "application_purpose",
            "applicant_count",
            "contact_email",
            "contact_phone_number",
            "disbursement_method",
            "disbursement_account_name",
            "disbursement_account_number",
        ]

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "applicant_name" not in payload and "applicantName" in payload:
            payload["applicant_name"] = payload.get("applicantName")
        payload.pop("applicantName", None)

        if "application_purpose" not in payload and "applicationPurpose" in payload:
            payload["application_purpose"] = payload.get("applicationPurpose")
        payload.pop("applicationPurpose", None)

        if "applicant_count" not in payload and "applicantCount" in payload:
            payload["applicant_count"] = payload.get("applicantCount")
        payload.pop("applicantCount", None)

        if "contact_email" not in payload and "contactEmail" in payload:
            payload["contact_email"] = payload.get("contactEmail")
        payload.pop("contactEmail", None)

        if "contact_phone_number" not in payload and "contactPhoneNumber" in payload:
            payload["contact_phone_number"] = payload.get("contactPhoneNumber")
        payload.pop("contactPhoneNumber", None)

        if "disbursement_method" not in payload and "disbursementMethod" in payload:
            payload["disbursement_method"] = payload.get("disbursementMethod")
        payload.pop("disbursementMethod", None)

        if "disbursement_account_name" not in payload and "disbursementAccountName" in payload:
            payload["disbursement_account_name"] = payload.get("disbursementAccountName")
        payload.pop("disbursementAccountName", None)

        if "disbursement_account_number" not in payload and "disbursementAccountNumber" in payload:
            payload["disbursement_account_number"] = payload.get("disbursementAccountNumber")
        payload.pop("disbursementAccountNumber", None)

        return super().to_internal_value(payload)

    def validate(self, attrs):
        loan_type = attrs["loan_type"]
        amount = attrs["amount"]
        term_months = attrs["term_months"]
        borrower = self.context["request"].user
        applicant_name = attrs.get("applicant_name", "").strip() or borrower.name.strip()
        application_purpose = attrs.get("application_purpose", Loan.ApplicationPurpose.PURCHASE)
        applicant_count = attrs.get("applicant_count", Loan.ApplicantCount.ONE)
        contact_email = attrs.get("contact_email", "").strip() or borrower.email.strip()
        contact_phone_number = normalize_phone_number(
            attrs.get("contact_phone_number", "").strip() or borrower.phone_number.strip()
        )
        disbursement_method = attrs.get("disbursement_method", Loan.DisbursementMethod.GCASH)
        account_name = attrs.get("disbursement_account_name", "").strip() or borrower.gcash_account_name.strip()
        account_number = attrs.get("disbursement_account_number", "").strip() or borrower.gcash_account_number.strip()

        if not loan_type.is_active:
            raise serializers.ValidationError("Selected loan type is inactive.")

        if amount < loan_type.min_amount or amount > loan_type.max_amount:
            raise serializers.ValidationError(
                f"Amount must be between {loan_type.min_amount} and {loan_type.max_amount}."
            )

        if term_months not in loan_type.terms_months:
            raise serializers.ValidationError("Invalid term_months for this loan type.")

        if not applicant_name:
            applicant_name = borrower.name.strip()

        phone_digits = [ch for ch in contact_phone_number if ch.isdigit()]
        if contact_phone_number and len(phone_digits) < 10:
            raise serializers.ValidationError("contact_phone_number must contain at least 10 digits.")

        # ── Enforce required documents per loan type ──────────────────────────
        required_docs = loan_type.required_documents or []
        LABEL = {
            "government_id": "Government ID",
            "student_id": "School / Student ID",
            "business_permit": "Business Permit",
            "business_owner_id": "Business Owner ID",
            "proof_of_revenue": "Proof of Monthly Revenue",
            "income_proof": "Proof of Income",
            "id": "ID Document",
        }
        # Strip income/revenue docs from student loans — only ID docs required
        loan_name = loan_type.name.lower()
        is_student_loan = any(k in loan_name for k in ("student", "education", "school"))
        is_business_loan = any(k in loan_name for k in ("business", "entrepreneur", "micro", "sme"))
        if is_student_loan:
            required_docs = [doc for doc in required_docs if doc not in {"income_proof", "proof_of_revenue"}]
        # Only business loans require pre-verified docs; student and general loans
        # allow upload-at-submission so the officer verifies after the fact
        if required_docs:
            if is_business_loan:
                verified_types = set(
                    BorrowerDocument.objects.filter(
                        borrower=borrower,
                        status=BorrowerDocument.VerificationStatus.VERIFIED,
                    ).values_list("document_type", flat=True)
                )
                missing = [
                    LABEL.get(d, d)
                    for d in required_docs
                    if not document_requirement_is_satisfied(d, verified_types)
                ]
                if missing:
                    raise serializers.ValidationError(
                        f"The following documents must be uploaded and verified by an officer before you can apply: {', '.join(missing)}."
                    )
            else:
                uploaded_types = set(
                    BorrowerDocument.objects.filter(borrower=borrower)
                    .values_list("document_type", flat=True)
                )
                missing = [
                    LABEL.get(d, d)
                    for d in required_docs
                    if not document_requirement_is_satisfied(d, uploaded_types)
                ]
                if missing:
                    raise serializers.ValidationError(
                        f"Please upload the following required documents first: {', '.join(missing)}."
                    )

        if evaluate_borrower_verification_status(borrower) != User.VerificationStatus.QUALIFIED:
            raise serializers.ValidationError(
                "Eligibility check failed. Your latest government ID and required student or income document must be verified by an officer before you can apply."
            )

        if disbursement_method != Loan.DisbursementMethod.GCASH:
            raise serializers.ValidationError("Only GCash disbursement is available right now.")

        if not account_name:
            raise serializers.ValidationError(
                "Save a GCash account name in Settings or provide one with this loan request."
            )

        if not account_number:
            raise serializers.ValidationError(
                "Save a GCash number in Settings or provide one with this loan request."
            )

        gcash_digits = normalize_gcash_account_number(account_number)

        if len(gcash_digits) != 11 or not gcash_digits.startswith("0"):
            raise serializers.ValidationError(
                "GCash disbursement_account_number must be an 11-digit mobile number."
            )
        account_number = gcash_digits

        attrs["applicant_name"] = applicant_name
        attrs["application_purpose"] = application_purpose
        attrs["applicant_count"] = applicant_count
        attrs["contact_email"] = contact_email
        attrs["contact_phone_number"] = contact_phone_number
        attrs["disbursement_method"] = disbursement_method
        attrs["disbursement_account_name"] = account_name
        attrs["disbursement_account_number"] = account_number
        return attrs

    def create(self, validated_data):
        borrower = self.context["request"].user
        return Loan.objects.create(
            borrower=borrower,
            borrower_name=validated_data.get("applicant_name", borrower.name),
            loan_type=validated_data["loan_type"],
            amount=validated_data["amount"],
            interest_rate=validated_data["loan_type"].base_interest_rate,
            term_months=validated_data["term_months"],
            balance=validated_data["amount"],
            status=Loan.Status.PENDING,
            application_purpose=validated_data.get("application_purpose", Loan.ApplicationPurpose.PURCHASE),
            applicant_count=validated_data.get("applicant_count", Loan.ApplicantCount.ONE),
            contact_email=validated_data.get("contact_email", borrower.email),
            contact_phone_number=validated_data.get("contact_phone_number", borrower.phone_number),
            disbursement_method=validated_data.get(
                "disbursement_method", Loan.DisbursementMethod.GCASH
            ),
            disbursement_account_name=validated_data.get("disbursement_account_name", borrower.name),
            disbursement_account_number=validated_data.get("disbursement_account_number", ""),
            disbursement_status=Loan.DisbursementStatus.PENDING,
        )


class LoanDecisionSerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    interest_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, min_value=Decimal("0.01")
    )
    rejection_reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        approve = attrs["approve"]
        interest_rate = attrs.get("interest_rate")
        rejection_reason = attrs.get("rejection_reason", "").strip()

        if approve and interest_rate is None:
            raise serializers.ValidationError("interest_rate is required when approving a loan.")
        if not approve and not rejection_reason:
            attrs["rejection_reason"] = "Application rejected."
        else:
            attrs["rejection_reason"] = rejection_reason

        return attrs


class LoanDisbursementSerializer(serializers.Serializer):
    loan_id = serializers.IntegerField()
    disbursement_reference = serializers.CharField(required=False, allow_blank=True, max_length=120)

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "loan_id" not in payload and "loanId" in payload:
            payload["loan_id"] = payload.get("loanId")
        payload.pop("loanId", None)

        if "disbursement_reference" not in payload and "disbursementReference" in payload:
            payload["disbursement_reference"] = payload.get("disbursementReference")
        payload.pop("disbursementReference", None)

        return super().to_internal_value(payload)

    @transaction.atomic
    def create(self, validated_data):
        try:
            loan = Loan.objects.select_for_update().get(pk=validated_data["loan_id"])
        except Loan.DoesNotExist as exc:
            raise serializers.ValidationError("Loan not found.") from exc
        disbursement_reference = validated_data.get("disbursement_reference", "").strip()

        try:
            return initiate_loan_disbursement(loan, disbursement_reference)
        except (PayoutStateError, PayoutConfigurationError) as exc:
            raise serializers.ValidationError(str(exc)) from exc
        except PayoutError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class PaymentSerializer(serializers.ModelSerializer):
    borrower_name = serializers.CharField(source="borrower.name", read_only=True)
    borrower_profile_photo_url = serializers.SerializerMethodField()
    recorded_by_name = serializers.CharField(source="recorded_by.name", read_only=True, allow_null=True)
    loan_status = serializers.CharField(source="loan.status", read_only=True)

    def get_borrower_profile_photo_url(self, obj):
        return build_media_url(getattr(obj.borrower, "profile_photo", None), self.context.get("request"))

    class Meta:
        model = Payment
        fields = [
            "id",
            "loan",
            "loan_status",
            "borrower",
            "borrower_name",
            "borrower_profile_photo_url",
            "amount",
            "date",
            "recorded_by",
            "recorded_by_name",
            "payment_method",
            "payment_reference",
            "note",
            "created_at",
        ]
        read_only_fields = ["borrower", "recorded_by", "created_at", "loan_status"]


def create_recorded_payment(
    *,
    loan: Loan,
    officer: User,
    amount: Decimal,
    payment_method: str = Payment.PaymentMethod.CASH,
    payment_reference: str = "",
    note: str = "",
    payment_date=None,
    cap_to_balance: bool = True,
):
    if loan.status != Loan.Status.APPROVED:
        raise serializers.ValidationError("Only approved loans can receive payments.")

    if loan.disbursement_status != Loan.DisbursementStatus.DISBURSED:
        raise serializers.ValidationError("Loan must be disbursed before payments can be recorded.")

    normalized_reference = payment_reference.strip()
    normalized_note = note.strip()

    if payment_method != Payment.PaymentMethod.CASH and not normalized_reference:
        raise serializers.ValidationError("payment_reference is required for transfer and e-wallet payments.")

    normalized_amount = min(amount, loan.balance) if cap_to_balance else amount
    if normalized_amount <= 0:
        raise serializers.ValidationError("Loan balance is already zero.")
    if not cap_to_balance and normalized_amount > loan.balance:
        raise serializers.ValidationError("Payment request exceeds the remaining loan balance.")

    payment = Payment.objects.create(
        loan=loan,
        borrower=loan.borrower,
        amount=normalized_amount,
        date=payment_date or timezone.localdate(),
        recorded_by=officer,
        payment_method=payment_method,
        payment_reference=normalized_reference,
        note=normalized_note,
    )

    loan.balance = loan.balance - normalized_amount
    loan.save(update_fields=["balance", "updated_at"])
    return payment


class PaymentCreateSerializer(serializers.Serializer):
    loan_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    payment_method = serializers.ChoiceField(
        choices=Payment.PaymentMethod.choices,
        required=False,
        default=Payment.PaymentMethod.CASH,
    )
    payment_reference = serializers.CharField(required=False, allow_blank=True, max_length=120)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "loan_id" not in payload and "loanId" in payload:
            payload["loan_id"] = payload.get("loanId")
        payload.pop("loanId", None)

        if "payment_method" not in payload and "paymentMethod" in payload:
            payload["payment_method"] = payload.get("paymentMethod")
        payload.pop("paymentMethod", None)

        if "payment_reference" not in payload and "paymentReference" in payload:
            payload["payment_reference"] = payload.get("paymentReference")
        payload.pop("paymentReference", None)

        return super().to_internal_value(payload)

    @transaction.atomic
    def create(self, validated_data):
        officer = self.context["request"].user
        try:
            loan = Loan.objects.select_for_update().get(pk=validated_data["loan_id"])
        except Loan.DoesNotExist as exc:
            raise serializers.ValidationError("Loan not found.") from exc
        return create_recorded_payment(
            loan=loan,
            officer=officer,
            amount=validated_data["amount"],
            payment_method=validated_data.get("payment_method", Payment.PaymentMethod.CASH),
            payment_reference=validated_data.get("payment_reference", ""),
            note=validated_data.get("note", ""),
        )


class PaymentSubmissionSerializer(serializers.ModelSerializer):
    borrower_name = serializers.CharField(source="borrower.name", read_only=True)
    borrower_profile_photo_url = serializers.SerializerMethodField()
    loan_status = serializers.CharField(source="loan.status", read_only=True)
    loan_type_name = serializers.CharField(source="loan.loan_type.name", read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.name", read_only=True, allow_null=True)
    proof_file_url = serializers.SerializerMethodField()
    approved_payment_id = serializers.IntegerField(read_only=True, allow_null=True)

    def get_borrower_profile_photo_url(self, obj):
        return build_media_url(getattr(obj.borrower, "profile_photo", None), self.context.get("request"))

    def get_proof_file_url(self, obj):
        return build_media_url(obj.proof_file, self.context.get("request"))

    class Meta:
        model = PaymentSubmission
        fields = [
            "id",
            "loan",
            "loan_status",
            "loan_type_name",
            "borrower",
            "borrower_name",
            "borrower_profile_photo_url",
            "amount",
            "payment_method",
            "payment_reference",
            "note",
            "proof_file_name",
            "proof_file_url",
            "status",
            "rejection_reason",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "approved_payment_id",
            "submitted_at",
        ]
        read_only_fields = [
            "borrower",
            "loan_status",
            "loan_type_name",
            "borrower_name",
            "borrower_profile_photo_url",
            "proof_file_url",
            "status",
            "rejection_reason",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "approved_payment_id",
            "submitted_at",
        ]


class BorrowerPaymentSubmissionCreateSerializer(serializers.Serializer):
    loan_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    payment_method = serializers.ChoiceField(
        choices=Payment.PaymentMethod.choices,
        required=False,
        default=Payment.PaymentMethod.CASH,
    )
    payment_reference = serializers.CharField(required=False, allow_blank=True, max_length=120)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)
    proof_file_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    proof_file = serializers.FileField(required=False, allow_null=True)

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "loan_id" not in payload and "loanId" in payload:
            payload["loan_id"] = payload.get("loanId")
        payload.pop("loanId", None)

        if "payment_method" not in payload and "paymentMethod" in payload:
            payload["payment_method"] = payload.get("paymentMethod")
        payload.pop("paymentMethod", None)

        if "payment_reference" not in payload and "paymentReference" in payload:
            payload["payment_reference"] = payload.get("paymentReference")
        payload.pop("paymentReference", None)

        if "proof_file_name" not in payload and "proofFileName" in payload:
            payload["proof_file_name"] = payload.get("proofFileName")
        payload.pop("proofFileName", None)

        return super().to_internal_value(payload)

    def validate(self, attrs):
        borrower = self.context["request"].user
        loan_id = attrs["loan_id"]

        try:
            loan = Loan.objects.select_related("borrower", "loan_type").get(pk=loan_id, borrower=borrower)
        except Loan.DoesNotExist as exc:
            raise serializers.ValidationError({"loan_id": "Loan not found."}) from exc

        if loan.status != Loan.Status.APPROVED:
            raise serializers.ValidationError("Only approved loans can accept payment requests.")

        if loan.disbursement_status != Loan.DisbursementStatus.DISBURSED:
            raise serializers.ValidationError("Loan must be disbursed before you can submit a payment request.")

        if loan.balance <= 0:
            raise serializers.ValidationError("This loan is already fully paid.")

        if attrs["amount"] > loan.balance:
            raise serializers.ValidationError({"amount": "Payment request cannot exceed the remaining balance."})

        payment_method = attrs.get("payment_method", Payment.PaymentMethod.CASH)
        payment_reference = attrs.get("payment_reference", "").strip()
        if payment_method != Payment.PaymentMethod.CASH and not payment_reference:
            raise serializers.ValidationError(
                {"payment_reference": "payment_reference is required for transfer and e-wallet payments."}
            )

        proof_file = attrs.get("proof_file")
        proof_file_name = attrs.get("proof_file_name", "").strip()
        if proof_file and not proof_file_name:
            proof_file_name = getattr(proof_file, "name", "").strip()
            attrs["proof_file_name"] = proof_file_name
        validate_payment_proof_upload(proof_file_name, proof_file)

        attrs["loan"] = loan
        return attrs

    def create(self, validated_data):
        borrower = self.context["request"].user
        return PaymentSubmission.objects.create(
            loan=validated_data["loan"],
            borrower=borrower,
            amount=validated_data["amount"],
            payment_method=validated_data.get("payment_method", Payment.PaymentMethod.CASH),
            payment_reference=validated_data.get("payment_reference", "").strip(),
            note=validated_data.get("note", "").strip(),
            proof_file_name=validated_data.get("proof_file_name", "").strip(),
            proof_file=validated_data.get("proof_file"),
        )


class PaymentSubmissionRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "rejection_reason" not in payload and "rejectionReason" in payload:
            payload["rejection_reason"] = payload.get("rejectionReason")
        payload.pop("rejectionReason", None)

        return super().to_internal_value(payload)


@transaction.atomic
def approve_payment_submission(submission: PaymentSubmission, officer: User):
    if submission.status != PaymentSubmission.ReviewStatus.PENDING:
        raise serializers.ValidationError("Only pending payment requests can be approved.")

    try:
        loan = Loan.objects.select_for_update().get(pk=submission.loan_id)
        locked_submission = PaymentSubmission.objects.select_for_update().get(pk=submission.pk)
    except (Loan.DoesNotExist, PaymentSubmission.DoesNotExist) as exc:
        raise serializers.ValidationError("Payment request not found.") from exc

    if locked_submission.status != PaymentSubmission.ReviewStatus.PENDING:
        raise serializers.ValidationError("Only pending payment requests can be approved.")

    payment = create_recorded_payment(
        loan=loan,
        officer=officer,
        amount=locked_submission.amount,
        payment_method=locked_submission.payment_method,
        payment_reference=locked_submission.payment_reference,
        note=locked_submission.note,
        cap_to_balance=False,
    )

    locked_submission.status = PaymentSubmission.ReviewStatus.APPROVED
    locked_submission.reviewed_by = officer
    locked_submission.reviewed_at = timezone.now()
    locked_submission.rejection_reason = ""
    locked_submission.approved_payment = payment
    locked_submission.save(
        update_fields=[
            "status",
            "reviewed_by",
            "reviewed_at",
            "rejection_reason",
            "approved_payment",
        ]
    )
    return locked_submission


@transaction.atomic
def reject_payment_submission(submission: PaymentSubmission, officer: User, rejection_reason: str = ""):
    if submission.status != PaymentSubmission.ReviewStatus.PENDING:
        raise serializers.ValidationError("Only pending payment requests can be rejected.")

    try:
        locked_submission = PaymentSubmission.objects.select_for_update().get(pk=submission.pk)
    except PaymentSubmission.DoesNotExist as exc:
        raise serializers.ValidationError("Payment request not found.") from exc

    if locked_submission.status != PaymentSubmission.ReviewStatus.PENDING:
        raise serializers.ValidationError("Only pending payment requests can be rejected.")

    locked_submission.status = PaymentSubmission.ReviewStatus.REJECTED
    locked_submission.reviewed_by = officer
    locked_submission.reviewed_at = timezone.now()
    locked_submission.rejection_reason = rejection_reason.strip()
    locked_submission.save(
        update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"]
    )
    return locked_submission


class BorrowerDocumentSerializer(serializers.ModelSerializer):
    verified_by_name = serializers.CharField(source="verified_by.name", read_only=True, allow_null=True)
    file_url = serializers.SerializerMethodField()

    def get_file_url(self, obj):
        return build_media_url(obj.file, self.context.get("request"))

    class Meta:
        model = BorrowerDocument
        fields = ["id", "borrower", "document_type", "file_name", "file", "file_url", "status", "rejection_reason", "verified_by_name", "verified_at", "uploaded_at"]
        read_only_fields = ["borrower", "status", "rejection_reason", "verified_by_name", "verified_at", "uploaded_at"]

    def validate(self, attrs):
        validate_borrower_document_upload(
            attrs.get("document_type", getattr(self.instance, "document_type", "")),
            attrs.get("file_name", getattr(self.instance, "file_name", "")),
            attrs.get("file"),
        )
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        return BorrowerDocument.objects.create(
            borrower=user,
            document_type=validated_data["document_type"],
            file_name=validated_data["file_name"],
            file=validated_data.get("file"),
        )


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "message", "notification_type", "is_read", "created_at"]


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "current_password" not in payload and "currentPassword" in payload:
            payload["current_password"] = payload.get("currentPassword")
        payload.pop("currentPassword", None)

        if "new_password" not in payload and "newPassword" in payload:
            payload["new_password"] = payload.get("newPassword")
        payload.pop("newPassword", None)

        if "confirm_new_password" not in payload and "confirmNewPassword" in payload:
            payload["confirm_new_password"] = payload.get("confirmNewPassword")
        payload.pop("confirmNewPassword", None)

        return super().to_internal_value(payload)

    def validate(self, attrs):
        user = self.context["request"].user
        current_password = attrs["current_password"]
        new_password = attrs["new_password"].strip()
        confirm_new_password = attrs["confirm_new_password"].strip()

        if not user.check_password(current_password):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})

        validated_new_password = validate_registration_password(new_password)
        if validated_new_password != confirm_new_password:
            raise serializers.ValidationError({"confirm_new_password": "New passwords do not match."})

        if current_password.strip() == validated_new_password:
            raise serializers.ValidationError({"new_password": "Choose a different password."})

        attrs["new_password"] = validated_new_password
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class BorrowerAccountRequestSerializer(serializers.ModelSerializer):
    resolved_by_name = serializers.CharField(source="resolved_by.name", read_only=True, allow_null=True)

    class Meta:
        model = BorrowerAccountRequest
        fields = [
            "id",
            "request_type",
            "status",
            "note",
            "admin_note",
            "resolved_by",
            "resolved_by_name",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "status",
            "admin_note",
            "resolved_by",
            "resolved_by_name",
            "resolved_at",
            "created_at",
            "updated_at",
        ]


class BorrowerAccountRequestCreateSerializer(serializers.Serializer):
    request_type = serializers.ChoiceField(choices=BorrowerAccountRequest.RequestType.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "request_type" not in payload and "requestType" in payload:
            payload["request_type"] = payload.get("requestType")
        payload.pop("requestType", None)

        return super().to_internal_value(payload)

    def validate(self, attrs):
        borrower = self.context["request"].user
        has_existing_active_request = BorrowerAccountRequest.objects.filter(
            borrower=borrower,
            request_type=attrs["request_type"],
            status__in=[
                BorrowerAccountRequest.Status.PENDING,
                BorrowerAccountRequest.Status.IN_PROGRESS,
            ],
        ).exists()
        if has_existing_active_request:
            raise serializers.ValidationError(
                {"request_type": "You already have an active request of this type."}
            )

        return attrs

    def create(self, validated_data):
        borrower = self.context["request"].user
        return BorrowerAccountRequest.objects.create(
            borrower=borrower,
            request_type=validated_data["request_type"],
            note=validated_data.get("note", "").strip(),
        )


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "name",
            "role",
            "is_active",
            "phone_number",
            "sms_notifications_enabled",
            "verification_status",
            "verification_updated_at",
            "employment_status",
            "monthly_income",
            "monthly_debt",
        ]

    def validate(self, attrs):
        sms_notifications_enabled = attrs.get(
            "sms_notifications_enabled",
            getattr(self.instance, "sms_notifications_enabled", False),
        )
        phone_number = normalize_phone_number(
            attrs.get("phone_number", getattr(self.instance, "phone_number", "")).strip()
        )
        phone_digits = [ch for ch in phone_number if ch.isdigit()]

        if sms_notifications_enabled and not phone_number:
            raise serializers.ValidationError("phone_number is required when SMS notifications are enabled.")

        if phone_number and len(phone_digits) < 10:
            raise serializers.ValidationError("phone_number must contain at least 10 digits.")

        attrs["phone_number"] = phone_number
        return attrs


class CurrentUserUpdateSerializer(serializers.ModelSerializer):
    remove_profile_photo = serializers.BooleanField(required=False, default=False, write_only=True)

    class Meta:
        model = User
        fields = [
            "name",
            "profile_photo",
            "remove_profile_photo",
            "phone_number",
            "sms_notifications_enabled",
            "gcash_account_name",
            "gcash_account_number",
            "employment_status",
            "monthly_income",
            "monthly_debt",
        ]

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "phone_number" not in payload and "phoneNumber" in payload:
            payload["phone_number"] = payload.get("phoneNumber")
        payload.pop("phoneNumber", None)

        if "remove_profile_photo" not in payload and "removeProfilePhoto" in payload:
            payload["remove_profile_photo"] = payload.get("removeProfilePhoto")
        payload.pop("removeProfilePhoto", None)

        if "sms_notifications_enabled" not in payload and "smsNotificationsEnabled" in payload:
            payload["sms_notifications_enabled"] = payload.get("smsNotificationsEnabled")
        payload.pop("smsNotificationsEnabled", None)

        if "gcash_account_name" not in payload and "gcashAccountName" in payload:
            payload["gcash_account_name"] = payload.get("gcashAccountName")
        payload.pop("gcashAccountName", None)

        if "gcash_account_number" not in payload and "gcashAccountNumber" in payload:
            payload["gcash_account_number"] = payload.get("gcashAccountNumber")
        payload.pop("gcashAccountNumber", None)

        if "monthly_income" not in payload and "monthlyIncome" in payload:
            payload["monthly_income"] = payload.get("monthlyIncome")
        payload.pop("monthlyIncome", None)

        if "monthly_debt" not in payload and "monthlyDebt" in payload:
            payload["monthly_debt"] = payload.get("monthlyDebt")
        payload.pop("monthlyDebt", None)

        if "employment_status" not in payload and "employmentStatus" in payload:
            payload["employment_status"] = payload.get("employmentStatus")
        payload.pop("employmentStatus", None)

        return super().to_internal_value(payload)

    def validate(self, attrs):
        profile_photo = attrs.get("profile_photo")
        remove_profile_photo = attrs.get("remove_profile_photo", False)

        if remove_profile_photo and profile_photo:
            raise serializers.ValidationError("Choose either a new profile photo or remove the current one, not both.")

        validate_profile_photo_upload(profile_photo)

        sms_notifications_enabled = attrs.get(
            "sms_notifications_enabled",
            getattr(self.instance, "sms_notifications_enabled", False),
        )
        phone_number = normalize_phone_number(
            attrs.get("phone_number", getattr(self.instance, "phone_number", "")).strip()
        )
        phone_digits = [ch for ch in phone_number if ch.isdigit()]

        if sms_notifications_enabled and not phone_number:
            raise serializers.ValidationError("phone_number is required when SMS notifications are enabled.")

        if phone_number and len(phone_digits) < 10:
            raise serializers.ValidationError("phone_number must contain at least 10 digits.")

        gcash_account_name = attrs.get(
            "gcash_account_name",
            getattr(self.instance, "gcash_account_name", ""),
        ).strip()
        gcash_account_number = normalize_gcash_account_number(
            attrs.get("gcash_account_number", getattr(self.instance, "gcash_account_number", "")).strip()
        )

        if gcash_account_number and (len(gcash_account_number) != 11 or not gcash_account_number.startswith("0")):
            raise serializers.ValidationError("gcash_account_number must be an 11-digit mobile number.")

        if gcash_account_name and not gcash_account_number:
            raise serializers.ValidationError("gcash_account_number is required when saving a GCash payout profile.")

        if gcash_account_number and not gcash_account_name:
            raise serializers.ValidationError("gcash_account_name is required when saving a GCash payout profile.")

        attrs["phone_number"] = phone_number
        attrs["gcash_account_name"] = gcash_account_name
        attrs["gcash_account_number"] = gcash_account_number
        return attrs

    def update(self, instance, validated_data):
        remove_profile_photo = validated_data.pop("remove_profile_photo", False)
        profile_photo = validated_data.get("profile_photo")

        if remove_profile_photo and instance.profile_photo:
            instance.profile_photo.delete(save=False)
            instance.profile_photo = None
        elif profile_photo and instance.profile_photo:
            instance.profile_photo.delete(save=False)

        return super().update(instance, validated_data)


class AdminProvisionedUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "name",
            "role",
            "approval_status",
            "is_active",
            "phone_number",
            "sms_notifications_enabled",
        ]

    def to_internal_value(self, data):
        payload = data.copy() if hasattr(data, "copy") else dict(data)

        if "phone_number" not in payload and "phoneNumber" in payload:
            payload["phone_number"] = payload.get("phoneNumber")
        payload.pop("phoneNumber", None)

        if "sms_notifications_enabled" not in payload and "smsNotificationsEnabled" in payload:
            payload["sms_notifications_enabled"] = payload.get("smsNotificationsEnabled")
        payload.pop("smsNotificationsEnabled", None)

        if "is_active" not in payload and "active" in payload:
            payload["is_active"] = payload.get("active")
        payload.pop("active", None)

        if "approval_status" not in payload and "approvalStatus" in payload:
            payload["approval_status"] = payload.get("approvalStatus")
        payload.pop("approvalStatus", None)

        return super().to_internal_value(payload)

    def validate(self, attrs):
        sms_notifications_enabled = attrs.get(
            "sms_notifications_enabled",
            getattr(self.instance, "sms_notifications_enabled", False),
        )
        phone_number = normalize_phone_number(
            attrs.get("phone_number", getattr(self.instance, "phone_number", "")).strip()
        )
        phone_digits = [ch for ch in phone_number if ch.isdigit()]

        if sms_notifications_enabled and not phone_number:
            raise serializers.ValidationError("phone_number is required when SMS notifications are enabled.")

        if phone_number and len(phone_digits) < 10:
            raise serializers.ValidationError("phone_number must contain at least 10 digits.")

        attrs["phone_number"] = phone_number
        return attrs

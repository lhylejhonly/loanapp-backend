from collections import defaultdict
from datetime import timedelta
import math
import secrets

from django.conf import settings
from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import exceptions, generics, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    BorrowerAccountRequest,
    BorrowerDocument,
    ContactMessage,
    Loan,
    LoanType,
    Notification,
    PasswordResetToken,
    Payment,
    PaymentSubmission,
    User,
)
from .permissions import IsAdminRole, IsBorrower, IsOfficer, IsSuperAdmin
from .payouts import PayoutConfigurationError, PayoutWebhookValidationError, apply_xendit_payout_webhook
from .serializers import (
    AdminProvisionedUserCreateSerializer,
    AdminProvisionedUserUpdateSerializer,
    BorrowerAccountRequestCreateSerializer,
    BorrowerAccountRequestSerializer,
    BorrowerDocumentSerializer,
    BorrowerPaymentSubmissionCreateSerializer,
    ChangePasswordSerializer,
    ContactMessageReplySerializer,
    ContactMessageSerializer,
    CurrentUserUpdateSerializer,
    CustomTokenObtainPairSerializer,
    LoanCreateSerializer,
    LoanDisbursementSerializer,
    LoanDecisionSerializer,
    LoanSerializer,
    LoanTypeSerializer,
    NotificationSerializer,
    PaymentCreateSerializer,
    PaymentSubmissionRejectSerializer,
    PaymentSubmissionSerializer,
    PaymentSerializer,
    RegisterSerializer,
    SendEmailVerificationCodeSerializer,
    UserSerializer,
    VerifyEmailCodeSerializer,
    approve_payment_submission,
    reject_payment_submission,
    refresh_borrower_verification_status,
    validate_registration_password,
)
from .email_verification import (
    EmailVerificationError,
    generate_verification_code,
    send_email_verification_code,
)


def create_notification(user, title, message, notification_type=Notification.Type.SYSTEM):
    Notification.objects.create(
        user=user,
        title=title,
        message=message,
        notification_type=notification_type,
    )


def notify_disbursement_status_change(loan: Loan, previous_status: str | None = None):
    if loan.disbursement_status == previous_status:
        return

    if loan.disbursement_status == Loan.DisbursementStatus.PROCESSING:
        create_notification(
            loan.borrower,
            "Loan Payout Processing",
            f"Your loan payout to {describe_disbursement_destination(loan)} is now being processed.",
            Notification.Type.LOAN,
        )
        return

    if loan.disbursement_status == Loan.DisbursementStatus.DISBURSED:
        create_notification(
            loan.borrower,
            "Loan Released",
            f"Your loan has been released via {describe_disbursement_destination(loan)}.",
            Notification.Type.LOAN,
        )
        return

    if loan.disbursement_status == Loan.DisbursementStatus.FAILED:
        failure_message = loan.disbursement_failure_message or "The payout provider rejected the release request."
        create_notification(
            loan.borrower,
            "Loan Release Failed",
            failure_message,
            Notification.Type.LOAN,
        )
        return

    if loan.disbursement_status == Loan.DisbursementStatus.REVERSED:
        create_notification(
            loan.borrower,
            "Loan Release Reversed",
            "The payout provider reversed your loan release. Our team will contact you for the next step.",
            Notification.Type.LOAN,
        )


def find_loan_for_payout_payload(payload: dict) -> Loan | None:
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return None

    external_id = str(data.get("id") or "").strip()
    reference_id = str(data.get("reference_id") or "").strip()
    if external_id:
        loan = Loan.objects.filter(disbursement_external_id=external_id).first()
        if loan:
            return loan
    if reference_id:
        return Loan.objects.filter(disbursement_reference=reference_id).first()
    return None


def describe_disbursement_destination(loan: Loan) -> str:
    method_label = loan.get_disbursement_method_display()
    if loan.disbursement_method == Loan.DisbursementMethod.CASH_PICKUP:
        return method_label

    if loan.disbursement_account_number:
        suffix = loan.disbursement_account_number[-4:]
        return f"{method_label} ending in {suffix}"

    return method_label


def apply_loan_decision(loan: Loan, reviewer: User, decision_data: dict) -> Loan:
    approve = decision_data["approve"]
    if approve:
        loan.status = Loan.Status.APPROVED
        loan.interest_rate = decision_data["interest_rate"]
        loan.rejection_reason = ""
        title = "Loan Approved"
        message = (
            f"Your loan was approved at {loan.interest_rate}% interest. "
            f"Funds will be released via {describe_disbursement_destination(loan)}."
        )
    else:
        loan.status = Loan.Status.REJECTED
        loan.rejection_reason = decision_data["rejection_reason"]
        title = "Loan Rejected"
        message = f"Your loan was rejected. {loan.rejection_reason}"

    loan.reviewed_by = reviewer
    loan.save(update_fields=["status", "interest_rate", "rejection_reason", "reviewed_by", "updated_at"])

    create_notification(loan.borrower, title, message, Notification.Type.LOAN)
    return loan


def anonymize_name(name: str) -> str:
    parts = [part for part in name.strip().split(" ") if part]
    if not parts:
        return "Borrower"

    if len(parts) == 1:
        return f"{parts[0][0]}***"

    return f"{parts[0][0]}*** {parts[-1][0]}***"


def _seconds_until(target, now) -> int:
    delta = (target - now).total_seconds()
    return max(1, math.ceil(delta))


def _retry_after_response(detail: str, retry_after_seconds: int, error_code: str):
    return Response(
        {
            "detail": detail,
            "code": error_code,
            "retry_after_seconds": retry_after_seconds,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def _reset_send_window_if_needed(user: User, now) -> list[str]:
    update_fields: list[str] = []
    window_started_at = user.email_verification_send_window_started_at
    if (
        not window_started_at
        or window_started_at + timedelta(hours=1) <= now
    ):
        user.email_verification_send_window_started_at = now
        user.email_verification_send_count = 0
        update_fields.extend(
            [
                "email_verification_send_window_started_at",
                "email_verification_send_count",
            ]
        )
    return update_fields


def _clear_verification_lock_if_needed(user: User, now) -> list[str]:
    if user.email_verification_locked_until and user.email_verification_locked_until <= now:
        user.email_verification_locked_until = None
        user.email_verification_attempt_count = 0
        return [
            "email_verification_locked_until",
            "email_verification_attempt_count",
        ]
    return []


def _clear_verification_state(user: User):
    user.email_verification_code = ""
    user.email_verification_expires_at = None
    user.email_verification_attempt_count = 0
    user.email_verification_locked_until = None


def generate_password_reset_code() -> str:
    while True:
        code = f"{secrets.randbelow(100_000_000):08d}"
        if not PasswordResetToken.objects.filter(token=code, used=False).exists():
            return code


def normalize_password_reset_code(value: str) -> str:
    return "".join(ch for ch in value.strip() if ch.isalnum()).upper()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_scope = "register"

    def perform_create(self, serializer):
        user = serializer.save()
        create_notification(
            user,
            "Account Created",
            "Your borrower account has been created. Upload your documents and apply for a loan.",
            Notification.Type.SYSTEM,
        )


class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_scope = "login"


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = CurrentUserUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        touched_verification_inputs = {
            "employment_status",
            "monthly_income",
            "monthly_debt",
        }
        if user.role == User.Role.BORROWER and touched_verification_inputs.intersection(serializer.validated_data.keys()):
            refresh_borrower_verification_status(user)

        return Response(UserSerializer(user, context={"request": request}).data)


class SendEmailVerificationCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "verification_send"

    def post(self, request):
        serializer = SendEmailVerificationCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        now = timezone.now()

        with transaction.atomic():
            user = User.objects.select_for_update().filter(email__iexact=validated["email"]).first()
            if not user:
                return Response(
                    {
                        "detail": "No account found for this email.",
                        "code": "verification_email_not_found",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if user.email_verified:
                return Response(
                    {
                        "detail": "Email already verified.",
                        "code": "verification_already_verified",
                        "verified": True,
                    }
                )

            update_fields = []
            update_fields.extend(_clear_verification_lock_if_needed(user, now))
            update_fields.extend(_reset_send_window_if_needed(user, now))
            if update_fields:
                user.save(update_fields=list(dict.fromkeys(update_fields)))

            if user.email_verification_locked_until and user.email_verification_locked_until > now:
                retry_after_seconds = _seconds_until(user.email_verification_locked_until, now)
                return _retry_after_response(
                    "Too many incorrect verification attempts. Try again later.",
                    retry_after_seconds,
                    "verification_locked",
                )

            last_sent_at = user.email_verification_last_sent_at
            cooldown_seconds = max(int(settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS), 1)
            if last_sent_at:
                available_at = last_sent_at + timedelta(seconds=cooldown_seconds)
                if available_at > now:
                    return _retry_after_response(
                        "Please wait before requesting another verification code.",
                        _seconds_until(available_at, now),
                        "verification_send_cooldown",
                    )

            max_sends_per_hour = max(int(settings.EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR), 1)
            window_started_at = user.email_verification_send_window_started_at or now
            if user.email_verification_send_count >= max_sends_per_hour:
                retry_after_seconds = _seconds_until(window_started_at + timedelta(hours=1), now)
                return _retry_after_response(
                    "You have reached the hourly limit for verification emails.",
                    retry_after_seconds,
                    "verification_send_limit_reached",
                )

            code = generate_verification_code()
            expires_at = now + timedelta(minutes=settings.EMAIL_VERIFICATION_TTL_MINUTES)

            try:
                send_email_verification_code(
                    recipient_email=user.email,
                    recipient_name=user.name,
                    code=code,
                )
            except EmailVerificationError as exc:
                return Response(
                    {"detail": str(exc), "code": "verification_send_failed"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            user.email_verified = False
            user.email_verified_at = None
            user.email_verification_code = code
            user.email_verification_expires_at = expires_at
            user.email_verification_last_sent_at = now
            user.email_verification_send_count += 1
            user.email_verification_attempt_count = 0
            user.email_verification_locked_until = None
            user.save(
                update_fields=[
                    "email_verified",
                    "email_verified_at",
                    "email_verification_code",
                    "email_verification_expires_at",
                    "email_verification_last_sent_at",
                    "email_verification_send_window_started_at",
                    "email_verification_send_count",
                    "email_verification_attempt_count",
                    "email_verification_locked_until",
                ]
            )

        return Response(
            {
                "detail": "Verification code sent.",
                "cooldown_seconds": cooldown_seconds,
                "remaining_sends_this_hour": max_sends_per_hour - user.email_verification_send_count,
                "send_window_reset_seconds": _seconds_until(
                    user.email_verification_send_window_started_at + timedelta(hours=1),
                    now,
                ),
            }
        )


class VerifyEmailCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "verification_verify"

    def post(self, request):
        serializer = VerifyEmailCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        now = timezone.now()

        with transaction.atomic():
            user = User.objects.select_for_update().filter(email__iexact=validated["email"]).first()
            if not user:
                return Response(
                    {
                        "detail": "No account found for this email.",
                        "code": "verification_email_not_found",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if user.email_verified:
                return Response(
                    {
                        "detail": "Email already verified.",
                        "code": "verification_already_verified",
                        "verified": True,
                    }
                )

            update_fields = _clear_verification_lock_if_needed(user, now)
            if update_fields:
                user.save(update_fields=update_fields)

            if user.email_verification_locked_until and user.email_verification_locked_until > now:
                retry_after_seconds = _seconds_until(user.email_verification_locked_until, now)
                return _retry_after_response(
                    "Too many incorrect verification attempts. Try again later.",
                    retry_after_seconds,
                    "verification_locked",
                )

            if not user.email_verification_code or not user.email_verification_expires_at:
                return Response(
                    {
                        "detail": "No verification code requested yet.",
                        "code": "verification_code_missing",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if user.email_verification_expires_at <= now:
                _clear_verification_state(user)
                user.save(
                    update_fields=[
                        "email_verification_code",
                        "email_verification_expires_at",
                        "email_verification_attempt_count",
                        "email_verification_locked_until",
                    ]
                )
                return Response(
                    {
                        "detail": "Verification code expired. Request a new code.",
                        "code": "verification_expired",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not secrets.compare_digest(user.email_verification_code, validated["code"]):
                user.email_verification_attempt_count += 1
                max_attempts = max(int(settings.EMAIL_VERIFICATION_MAX_VERIFY_ATTEMPTS), 1)
                if user.email_verification_attempt_count >= max_attempts:
                    user.email_verification_locked_until = now + timedelta(
                        minutes=settings.EMAIL_VERIFICATION_LOCKOUT_MINUTES
                    )
                    user.save(
                        update_fields=[
                            "email_verification_attempt_count",
                            "email_verification_locked_until",
                        ]
                    )
                    retry_after_seconds = _seconds_until(user.email_verification_locked_until, now)
                    return _retry_after_response(
                        "Too many incorrect verification attempts. Request a new code after the lockout.",
                        retry_after_seconds,
                        "verification_locked",
                    )

                remaining_attempts = max_attempts - user.email_verification_attempt_count
                user.save(update_fields=["email_verification_attempt_count"])
                return Response(
                    {
                        "detail": "Invalid verification code.",
                        "code": "verification_invalid",
                        "remaining_attempts": remaining_attempts,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            _clear_verification_state(user)
            user.email_verified = True
            user.email_verified_at = now
            user.email_verification_send_count = 0
            user.email_verification_send_window_started_at = None
            user.email_verification_last_sent_at = None
            user.save(
                update_fields=[
                    "email_verified",
                    "email_verified_at",
                    "email_verification_code",
                    "email_verification_expires_at",
                    "email_verification_attempt_count",
                    "email_verification_locked_until",
                    "email_verification_send_count",
                    "email_verification_send_window_started_at",
                    "email_verification_last_sent_at",
                ]
            )

        return Response({"detail": "Email verified.", "verified": True})


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()

            executor = MigrationExecutor(connection)
            pending_migrations = executor.migration_plan(executor.loader.graph.leaf_nodes())
            user_table_exists = User._meta.db_table in connection.introspection.table_names()
        except Exception as exc:
            response_data = {
                "status": "error",
                "service": "loan-app-backend",
                "database": "unavailable",
                "timestamp": timezone.now(),
            }
            if settings.DEBUG:
                response_data["detail"] = str(exc)

            return Response(
                response_data,
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if pending_migrations or not user_table_exists:
            response_data = {
                "status": "error",
                "service": "loan-app-backend",
                "database": "ok",
                "schema": "not_ready",
                "timestamp": timezone.now(),
            }
            if settings.DEBUG:
                response_data["user_table_exists"] = user_table_exists
                response_data["pending_migrations"] = len(pending_migrations)

            return Response(
                response_data,
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "status": "ok",
                "service": "loan-app-backend",
                "database": "ok",
                "schema": "ok",
                "timestamp": timezone.now(),
            }
        )


class PublicLoanTypeListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = LoanTypeSerializer

    def get_queryset(self):
        return LoanType.objects.filter(is_active=True).order_by("name")


class PublicOverviewView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        loan_types = LoanType.objects.filter(is_active=True).order_by("name")
        loans = Loan.objects.select_related("loan_type")
        approved_loans = loans.filter(status=Loan.Status.APPROVED)
        disbursed_loans = approved_loans.filter(disbursement_status=Loan.DisbursementStatus.DISBURSED)
        total_applications = loans.count()
        approved_count = approved_loans.count()
        total_disbursed = disbursed_loans.aggregate(total=Sum("amount"))["total"] or 0
        approval_rate_percent = (
            round((approved_count / total_applications) * 100, 2) if total_applications else 0.0
        )

        recent_approved_loans = [
            {
                "id": loan.id,
                "borrower_alias": anonymize_name(loan.borrower_name),
                "loan_type_id": loan.loan_type_id,
                "loan_type_name": loan.loan_type.name,
                "amount": loan.amount,
                "interest_rate": loan.interest_rate,
                "term_months": loan.term_months,
                "status": loan.status,
                "balance": loan.balance,
                "created_at": loan.created_at,
                "updated_at": loan.updated_at,
            }
            for loan in approved_loans.order_by("-updated_at")[:5]
        ]

        recent_payments = [
            {
                "id": payment.id,
                "loan_id": payment.loan_id,
                "amount": payment.amount,
                "date": payment.date,
            }
            for payment in Payment.objects.select_related("loan").order_by("-date", "-created_at")[:5]
        ]

        return Response(
            {
                "loan_types": LoanTypeSerializer(loan_types, many=True).data,
                "stats": {
                    "applications": total_applications,
                    "pending": loans.filter(status=Loan.Status.PENDING).count(),
                    "approved": approved_count,
                    "rejected": loans.filter(status=Loan.Status.REJECTED).count(),
                    "approval_rate_percent": approval_rate_percent,
                    "total_disbursed": total_disbursed,
                },
                "recent_approved_loans": recent_approved_loans,
                "recent_payments": recent_payments,
            }
        )


class BorrowerDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsBorrower]

    def get(self, request):
        borrower_loans = (
            Loan.objects.filter(borrower=request.user)
            .select_related("loan_type", "reviewed_by")
            .prefetch_related("payments")
        )
        borrower_payments = Payment.objects.filter(borrower=request.user)

        outstanding_balance = (
            borrower_loans.filter(status=Loan.Status.APPROVED).aggregate(total=Sum("balance"))["total"] or 0
        )
        total_paid = borrower_payments.aggregate(total=Sum("amount"))["total"] or 0

        return Response(
            {
                "counts": {
                    "pending": borrower_loans.filter(status=Loan.Status.PENDING).count(),
                    "approved": borrower_loans.filter(status=Loan.Status.APPROVED).count(),
                    "rejected": borrower_loans.filter(status=Loan.Status.REJECTED).count(),
                },
                "outstanding_balance": outstanding_balance,
                "total_paid": total_paid,
                "recent_loans": LoanSerializer(borrower_loans[:5], many=True).data,
                "recent_payments": PaymentSerializer(borrower_payments[:5], many=True).data,
            }
        )


class BorrowerLoanListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsBorrower]

    def get_queryset(self):
        return (
            Loan.objects.filter(borrower=self.request.user)
            .select_related("loan_type", "reviewed_by")
            .prefetch_related("payments")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return LoanCreateSerializer
        return LoanSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        loan = self.perform_create(serializer)
        headers = self.get_success_headers(LoanSerializer(loan).data)
        return Response(LoanSerializer(loan).data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        loan = serializer.save()

        create_notification(
            loan.borrower,
            "Application Submitted",
            f"Your {loan.loan_type.name} application for PHP {loan.amount} is pending review.",
            Notification.Type.LOAN,
        )

        for officer in User.objects.filter(role=User.Role.OFFICER, is_active=True):
            create_notification(
                officer,
                "New Loan Application",
                f"{loan.borrower_name} submitted a new loan application.",
                Notification.Type.LOAN,
            )

        return loan


class BorrowerPaymentListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsBorrower]
    serializer_class = PaymentSerializer

    def get_queryset(self):
        return Payment.objects.filter(borrower=self.request.user).select_related("loan", "recorded_by")


class BorrowerPaymentSubmissionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsBorrower]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return BorrowerPaymentSubmissionCreateSerializer
        return PaymentSubmissionSerializer

    def get_queryset(self):
        queryset = (
            PaymentSubmission.objects.filter(borrower=self.request.user)
            .select_related("loan", "loan__loan_type", "borrower", "reviewed_by", "approved_payment")
        )
        loan_id = self.request.query_params.get("loan_id")
        if loan_id:
            queryset = queryset.filter(loan_id=loan_id)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = serializer.save()

        create_notification(
            submission.borrower,
            "Payment Submitted",
            f"Your payment request of PHP {submission.amount} is waiting for officer review.",
            Notification.Type.PAYMENT,
        )
        for officer in User.objects.filter(role=User.Role.OFFICER, is_active=True):
            create_notification(
                officer,
                "Payment Review Needed",
                f"{submission.borrower.name} submitted a payment request for loan #{submission.loan_id}.",
                Notification.Type.PAYMENT,
            )

        response_serializer = PaymentSubmissionSerializer(submission, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class BorrowerDocumentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsBorrower]
    serializer_class = BorrowerDocumentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return BorrowerDocument.objects.filter(borrower=self.request.user)

    def perform_create(self, serializer):
        document = serializer.save()
        refresh_borrower_verification_status(document.borrower)
        create_notification(
            document.borrower,
            "Document Uploaded",
            f"Your {document.document_type} document was uploaded successfully.",
            Notification.Type.DOCUMENT,
        )


class BorrowerNotificationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsBorrower]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)


class BorrowerNotificationReadView(APIView):
    permission_classes = [IsAuthenticated, IsBorrower]

    def post(self, request, pk):
        notification = get_object_or_404(Notification, pk=pk, user=request.user)
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response({"detail": "Notification marked as read."})


class BorrowerAccountRequestListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsBorrower]

    def get_queryset(self):
        return BorrowerAccountRequest.objects.filter(borrower=self.request.user).select_related("resolved_by")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return BorrowerAccountRequestCreateSerializer
        return BorrowerAccountRequestSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account_request = serializer.save()
        create_notification(
            request.user,
            "Account Request Submitted",
            f"Your {account_request.get_request_type_display().lower()} request is now pending review.",
            Notification.Type.SYSTEM,
        )
        response_serializer = BorrowerAccountRequestSerializer(account_request, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class OfficerApplicationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsOfficer]
    serializer_class = LoanSerializer

    def get_queryset(self):
        queryset = (
            Loan.objects.select_related("borrower", "loan_type", "reviewed_by")
            .prefetch_related("payments")
            .order_by("-created_at")
        )
        status_filter = self.request.query_params.get("status")
        if status_filter in {Loan.Status.PENDING, Loan.Status.APPROVED, Loan.Status.REJECTED}:
            queryset = queryset.filter(status=status_filter)
        return queryset


class OfficerLoanDecisionView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def post(self, request, pk):
        loan = get_object_or_404(Loan, pk=pk)
        serializer = LoanDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if loan.status != Loan.Status.PENDING:
            return Response(
                {"detail": "Only pending loans can be reviewed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        apply_loan_decision(loan, request.user, serializer.validated_data)
        return Response(LoanSerializer(loan).data)


class AdminLoanDecisionView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        loan = get_object_or_404(Loan, pk=pk)
        serializer = LoanDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if loan.status != Loan.Status.PENDING:
            return Response(
                {"detail": "Only pending loans can be reviewed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        apply_loan_decision(loan, request.user, serializer.validated_data)
        return Response(LoanSerializer(loan).data)


class OfficerBorrowerListView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def get(self, request):
        borrowers = User.objects.filter(role=User.Role.BORROWER).order_by("name")
        payload = []

        for borrower in borrowers:
            borrower_loans = Loan.objects.filter(borrower=borrower)
            payload.append(
                {
                    "user": UserSerializer(borrower).data,
                    "metrics": {
                        "pending_loans": borrower_loans.filter(status=Loan.Status.PENDING).count(),
                        "approved_loans": borrower_loans.filter(status=Loan.Status.APPROVED).count(),
                        "outstanding_balance": borrower_loans.filter(status=Loan.Status.APPROVED).aggregate(
                            total=Sum("balance")
                        )["total"]
                        or 0,
                    },
                }
            )

        return Response(payload)


class OfficerToggleBorrowerStatusView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def post(self, request, pk):
        borrower = get_object_or_404(User, pk=pk, role=User.Role.BORROWER)
        borrower.is_active = not borrower.is_active
        borrower.save(update_fields=["is_active"])

        create_notification(
            borrower,
            "Account Status Updated",
            "Your borrower account is now active."
            if borrower.is_active
            else "Your borrower account has been deactivated.",
            Notification.Type.SYSTEM,
        )

        return Response(
            {
                "detail": "Borrower status updated.",
                "borrower": UserSerializer(borrower).data,
            }
        )


class OfficerApprovedLoanListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsOfficer]
    serializer_class = LoanSerializer

    def get_queryset(self):
        return (
            Loan.objects.filter(status=Loan.Status.APPROVED, balance__gt=0)
            .select_related("borrower", "loan_type")
            .prefetch_related("payments")
        )


class OfficerPaymentListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsOfficer]
    serializer_class = PaymentSerializer

    def get_queryset(self):
        queryset = Payment.objects.select_related("loan", "borrower", "recorded_by")
        loan_id = self.request.query_params.get("loan_id")
        if loan_id:
            queryset = queryset.filter(loan_id=loan_id)
        return queryset


class OfficerPaymentSubmissionListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsOfficer]
    serializer_class = PaymentSubmissionSerializer

    def get_queryset(self):
        queryset = PaymentSubmission.objects.select_related(
            "loan",
            "loan__loan_type",
            "borrower",
            "reviewed_by",
            "approved_payment",
        )
        status_filter = self.request.query_params.get("status")
        if status_filter in {
            PaymentSubmission.ReviewStatus.PENDING,
            PaymentSubmission.ReviewStatus.APPROVED,
            PaymentSubmission.ReviewStatus.REJECTED,
        }:
            queryset = queryset.filter(status=status_filter)
        loan_id = self.request.query_params.get("loan_id")
        if loan_id:
            queryset = queryset.filter(loan_id=loan_id)
        borrower_id = self.request.query_params.get("borrower_id")
        if borrower_id:
            queryset = queryset.filter(borrower_id=borrower_id)
        return queryset


class OfficerLoanDisbursementView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def post(self, request):
        serializer = LoanDisbursementSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        current_loan = Loan.objects.only("disbursement_status").get(pk=serializer.validated_data["loan_id"])
        previous_status = current_loan.disbursement_status
        loan = serializer.save()
        notify_disbursement_status_change(loan, previous_status)

        return Response(LoanSerializer(loan).data, status=status.HTTP_200_OK)


class OfficerPaymentCreateView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def post(self, request):
        serializer = PaymentCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()

        create_notification(
            payment.borrower,
            "Payment Recorded",
            f"A payment of PHP {payment.amount} has been recorded on your loan.",
            Notification.Type.PAYMENT,
        )

        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class OfficerApprovePaymentSubmissionView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def post(self, request, pk):
        submission = get_object_or_404(PaymentSubmission, pk=pk)
        submission = approve_payment_submission(submission, request.user)

        create_notification(
            submission.borrower,
            "Payment Approved",
            f"Your payment request of PHP {submission.amount} has been approved and recorded.",
            Notification.Type.PAYMENT,
        )

        serializer = PaymentSubmissionSerializer(submission, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class OfficerRejectPaymentSubmissionView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def post(self, request, pk):
        submission = get_object_or_404(PaymentSubmission, pk=pk)
        serializer = PaymentSubmissionRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = reject_payment_submission(
            submission,
            request.user,
            serializer.validated_data.get("rejection_reason", ""),
        )

        rejection_reason = submission.rejection_reason.strip()
        rejection_message = (
            f"Your payment request was rejected: {rejection_reason}"
            if rejection_reason
            else "Your payment request was rejected. Please review it and submit again."
        )
        create_notification(
            submission.borrower,
            "Payment Rejected",
            rejection_message,
            Notification.Type.PAYMENT,
        )

        response_serializer = PaymentSubmissionSerializer(submission, context={"request": request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class XenditPayoutWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        previous_status = None
        current_loan = find_loan_for_payout_payload(payload)
        if current_loan:
            previous_status = current_loan.disbursement_status

        try:
            updated_loan = apply_xendit_payout_webhook(payload, request.headers.get("x-callback-token"))
        except PayoutWebhookValidationError:
            return Response({"detail": "Invalid payout webhook token."}, status=status.HTTP_403_FORBIDDEN)
        except PayoutConfigurationError:
            return Response({"detail": "Payout webhook is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        if updated_loan:
            notify_disbursement_status_change(updated_loan, previous_status)

        return Response({"detail": "Webhook received."}, status=status.HTTP_200_OK)


class AdminDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        users = User.objects.all()
        loans = Loan.objects.all()
        payments = Payment.objects.all()

        response_data = {
            "users": {
                "total": users.count(),
                "borrowers": users.filter(role=User.Role.BORROWER).count(),
                "officers": users.filter(role=User.Role.OFFICER).count(),
                "admins": users.filter(role=User.Role.ADMIN).count(),
            },
            "loans": {
                "total": loans.count(),
                "pending": loans.filter(status=Loan.Status.PENDING).count(),
                "approved": loans.filter(status=Loan.Status.APPROVED).count(),
                "rejected": loans.filter(status=Loan.Status.REJECTED).count(),
                "total_disbursed": loans.filter(
                    status=Loan.Status.APPROVED,
                    disbursement_status=Loan.DisbursementStatus.DISBURSED,
                ).aggregate(total=Sum("amount"))["total"]
                or 0,
                "outstanding_balance": loans.filter(status=Loan.Status.APPROVED).aggregate(total=Sum("balance"))["total"]
                or 0,
            },
            "payments": {
                "total_count": payments.count(),
                "total_collected": payments.aggregate(total=Sum("amount"))["total"] or 0,
            },
            "documents": {
                "unverified": BorrowerDocument.objects.filter(
                    status=BorrowerDocument.VerificationStatus.UPLOADED
                ).count(),
            },
        }

        return Response(response_data)


class AdminReportsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        loans = Loan.objects.all()
        payments = Payment.objects.all().order_by("-date")

        approved_amount = loans.filter(status=Loan.Status.APPROVED).aggregate(total=Sum("amount"))["total"] or 0
        collected_amount = payments.aggregate(total=Sum("amount"))["total"] or 0
        collection_rate = float((collected_amount / approved_amount) * 100) if approved_amount else 0.0

        monthly = defaultdict(float)
        for payment in payments:
            month_key = payment.date.strftime("%Y-%m")
            monthly[month_key] += float(payment.amount)

        top_borrowers = []
        for borrower in User.objects.filter(role=User.Role.BORROWER).order_by("name"):
            total_loaned = (
                loans.filter(borrower=borrower, status=Loan.Status.APPROVED).aggregate(total=Sum("amount"))["total"]
                or 0
            )
            top_borrowers.append(
                {
                    "borrower_id": borrower.id,
                    "name": borrower.name,
                    "approved_amount": total_loaned,
                }
            )
        top_borrowers.sort(key=lambda item: float(item["approved_amount"]), reverse=True)

        return Response(
            {
                "performance": {
                    "approved_principal": approved_amount,
                    "collected_payments": collected_amount,
                    "collection_rate_percent": round(collection_rate, 2),
                },
                "loan_status_breakdown": {
                    "pending": loans.filter(status=Loan.Status.PENDING).count(),
                    "approved": loans.filter(status=Loan.Status.APPROVED).count(),
                    "rejected": loans.filter(status=Loan.Status.REJECTED).count(),
                },
                "monthly_payment_trend": [
                    {"month": month, "amount": amount}
                    for month, amount in sorted(monthly.items(), reverse=True)
                ],
                "top_borrowers": top_borrowers[:5],
            }
        )


class AdminTransactionView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        loans = Loan.objects.select_related("borrower", "loan_type", "reviewed_by").prefetch_related("payments")
        payments = Payment.objects.select_related("loan", "borrower", "recorded_by")
        return Response(
            {
                "loans": LoanSerializer(loans, many=True).data,
                "payments": PaymentSerializer(payments, many=True).data,
            }
        )


class AdminLoanListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = LoanSerializer
    queryset = Loan.objects.select_related("borrower", "loan_type", "reviewed_by").prefetch_related("payments").all()


class AdminUserListView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsSuperAdmin()]
        return [permission() for permission in self.permission_classes]

    def get_queryset(self):
        return User.objects.filter(is_superuser=False).order_by("-date_joined")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return AdminProvisionedUserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        admin_user = serializer.save()
        create_notification(
            admin_user,
            "Account Created",
            f"A super admin created your {admin_user.get_role_display().lower()} account. Use the provided credentials to sign in.",
            Notification.Type.SYSTEM,
        )


class AdminUserDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminProvisionedUserUpdateSerializer

    def get_queryset(self):
        return User.objects.filter(is_superuser=False)

    def perform_update(self, serializer):
        target_user = self.get_object()
        validated_data = serializer.validated_data

        if target_user == self.request.user and serializer.validated_data.get("is_active") is False:
            raise exceptions.ValidationError("You cannot deactivate your own account.")
        if target_user == self.request.user and "role" in validated_data:
            raise exceptions.ValidationError("You cannot change your own role.")
        if (
            target_user == self.request.user
            and validated_data.get("approval_status") in {User.ApprovalStatus.PENDING, User.ApprovalStatus.REJECTED}
        ):
            raise exceptions.ValidationError("You cannot change your own approval status.")

        restricted_fields = {"role", "approval_status"}
        if not self.request.user.is_superuser and restricted_fields.intersection(validated_data.keys()):
            raise exceptions.ValidationError("Only the super admin can approve accounts and assign roles.")

        if (
            not self.request.user.is_superuser
            and target_user.approval_status != User.ApprovalStatus.APPROVED
            and "is_active" in validated_data
        ):
            raise exceptions.ValidationError("Only the super admin can change access for accounts awaiting approval.")

        previous_role = target_user.role
        previous_approval_status = target_user.approval_status
        previous_is_active = target_user.is_active
        save_kwargs = {}

        next_role = validated_data.get("role", target_user.role)
        if self.request.user.is_superuser and "role" in validated_data:
            save_kwargs["is_staff"] = next_role == User.Role.ADMIN

        next_approval_status = validated_data.get("approval_status")
        if self.request.user.is_superuser and next_approval_status:
            if next_approval_status == User.ApprovalStatus.APPROVED:
                save_kwargs.update(
                    {
                        "is_active": True,
                        "is_staff": next_role == User.Role.ADMIN,
                        "approved_at": timezone.now(),
                        "approved_by": self.request.user,
                    }
                )
            else:
                save_kwargs.update(
                    {
                        "is_active": False,
                        "approved_at": None,
                        "approved_by": None,
                    }
                )

        updated_user = serializer.save(**save_kwargs)

        if (
            updated_user.approval_status == User.ApprovalStatus.APPROVED
            and previous_approval_status != User.ApprovalStatus.APPROVED
        ):
            create_notification(
                updated_user,
                "Account Approved",
                f"Your account has been approved by the super admin and assigned the {updated_user.get_role_display().lower()} role.",
                Notification.Type.SYSTEM,
            )
        elif (
            updated_user.approval_status == User.ApprovalStatus.REJECTED
            and previous_approval_status != User.ApprovalStatus.REJECTED
        ):
            create_notification(
                updated_user,
                "Account Request Rejected",
                "Your registration request was rejected by the super admin.",
                Notification.Type.SYSTEM,
            )
        elif previous_role != updated_user.role:
            create_notification(
                updated_user,
                "Role Updated",
                f"Your account role has been changed to {updated_user.get_role_display().lower()}.",
                Notification.Type.SYSTEM,
            )
        elif previous_is_active != updated_user.is_active:
            create_notification(
                updated_user,
                "Account Access Updated",
                "Your account access has been updated by an administrator.",
                Notification.Type.SYSTEM,
            )


class BorrowerContactMessageListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsBorrower]
    serializer_class = ContactMessageSerializer

    def get_queryset(self):
        return ContactMessage.objects.filter(sender=self.request.user)

    def perform_create(self, serializer):
        message = serializer.save(sender=self.request.user)
        for staff in User.objects.filter(role__in=[User.Role.OFFICER, User.Role.ADMIN], is_active=True):
            create_notification(
                staff,
                "New Message from Borrower",
                f"{message.sender.name} sent a message: {message.subject}",
                Notification.Type.SYSTEM,
            )


class StaffContactMessageListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ContactMessageSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role not in [User.Role.OFFICER, User.Role.ADMIN]:
            return ContactMessage.objects.none()
        queryset = ContactMessage.objects.select_related("sender", "replied_by")
        status_filter = self.request.query_params.get("status")
        if status_filter in {ContactMessage.Status.UNREAD, ContactMessage.Status.READ, ContactMessage.Status.REPLIED}:
            queryset = queryset.filter(status=status_filter)
        return queryset


class StaffContactMessageReplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in [User.Role.OFFICER, User.Role.ADMIN]:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        message = get_object_or_404(ContactMessage, pk=pk)
        serializer = ContactMessageReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message.reply = serializer.validated_data["reply"]
        message.status = ContactMessage.Status.REPLIED
        message.replied_by = request.user
        message.replied_at = timezone.now()
        message.save(update_fields=["reply", "status", "replied_by", "replied_at"])
        create_notification(
            message.sender,
            "Message Reply",
            f"Your message '{message.subject}' has been replied to.",
            Notification.Type.SYSTEM,
        )
        return Response(ContactMessageSerializer(message).data)

    def patch(self, request, pk):
        if request.user.role not in [User.Role.OFFICER, User.Role.ADMIN]:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        message = get_object_or_404(ContactMessage, pk=pk)
        if message.status == ContactMessage.Status.UNREAD:
            message.status = ContactMessage.Status.READ
            message.save(update_fields=["status"])
        return Response(ContactMessageSerializer(message).data)


class AdminLoanTypeListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = LoanTypeSerializer
    queryset = LoanType.objects.all().order_by("name")


class AdminLoanTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = LoanTypeSerializer
    queryset = LoanType.objects.all()


class BorrowerCancelLoanView(APIView):
    permission_classes = [IsAuthenticated, IsBorrower]

    def post(self, request, pk):
        loan = get_object_or_404(Loan, pk=pk, borrower=request.user)
        if loan.status != Loan.Status.PENDING:
            return Response(
                {"detail": "Only pending loans can be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        loan.status = Loan.Status.REJECTED
        loan.rejection_reason = "Cancelled by borrower."
        loan.cancelled_at = timezone.now()
        loan.save(update_fields=["status", "rejection_reason", "cancelled_at", "updated_at"])
        create_notification(
            loan.borrower,
            "Application Cancelled",
            f"Your {loan.loan_type.name} application has been cancelled.",
            Notification.Type.LOAN,
        )
        return Response(LoanSerializer(loan).data)


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "forgot_password"

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email:
            return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()

        try:
            with transaction.atomic():
                user = User.objects.select_for_update().filter(email__iexact=email).first()
                if not user:
                    return Response({"detail": "If that email exists, a reset code has been sent."})

                token_value = generate_password_reset_code()
                expires_at = now + timedelta(hours=1)
                PasswordResetToken.objects.filter(user=user, used=False).update(used=True)
                PasswordResetToken.objects.create(user=user, token=token_value, expires_at=expires_at)

                send_email_verification_code(
                    recipient_email=user.email,
                    recipient_name=user.name,
                    code=token_value,
                )
        except EmailVerificationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({"detail": "If that email exists, a reset code has been sent."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "reset_password"

    def post(self, request):
        token_value = normalize_password_reset_code(request.data.get("token", ""))
        new_password = request.data.get("new_password", "").strip()
        if not token_value or not new_password:
            return Response({"detail": "Token and new_password are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_password = validate_registration_password(new_password)
        except serializers.ValidationError as exc:
            detail = exc.detail[0] if isinstance(exc.detail, list) else exc.detail
            return Response({"detail": str(detail)}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        reset_token = PasswordResetToken.objects.filter(
            token=token_value,
            used=False,
            expires_at__gt=now,
        ).first()
        if not reset_token:
            return Response({"detail": "Invalid or expired reset token."}, status=status.HTTP_400_BAD_REQUEST)
        reset_token.user.set_password(new_password)
        reset_token.user.save(update_fields=["password"])
        reset_token.used = True
        reset_token.save(update_fields=["used"])
        return Response({"detail": "Password reset successfully."})


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        create_notification(
            request.user,
            "Password Updated",
            "Your account password was updated successfully.",
            Notification.Type.SYSTEM,
        )
        return Response({"detail": "Password updated successfully."})


class OfficerVerifyDocumentView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def post(self, request, pk):
        document = get_object_or_404(BorrowerDocument, pk=pk)
        document.status = BorrowerDocument.VerificationStatus.VERIFIED
        document.verified_by = request.user
        document.verified_at = timezone.now()
        document.save(update_fields=["status", "verified_by", "verified_at"])
        refresh_borrower_verification_status(document.borrower)
        create_notification(
            document.borrower,
            "Document Verified",
            f"Your {document.document_type} document has been verified by a loan officer.",
            Notification.Type.DOCUMENT,
        )
        return Response({"detail": "Document verified.", "status": document.status})


class OfficerBorrowerDocumentsView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def get(self, request, borrower_id):
        documents = BorrowerDocument.objects.filter(borrower_id=borrower_id).select_related("verified_by")
        return Response(BorrowerDocumentSerializer(documents, many=True, context={"request": request}).data)


class OfficerRejectDocumentView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]

    def post(self, request, pk):
        document = get_object_or_404(BorrowerDocument, pk=pk)
        rejection_reason = request.data.get("rejection_reason", "").strip()
        document.status = BorrowerDocument.VerificationStatus.REJECTED
        document.rejection_reason = rejection_reason or "Document rejected by loan officer."
        document.verified_by = request.user
        document.verified_at = timezone.now()
        document.save(update_fields=["status", "rejection_reason", "verified_by", "verified_at"])
        refresh_borrower_verification_status(document.borrower)
        create_notification(
            document.borrower,
            "Document Rejected",
            f"Your {document.document_type} document was rejected. Reason: {document.rejection_reason}",
            Notification.Type.DOCUMENT,
        )
        return Response({"detail": "Document rejected.", "status": document.status})


class OfficerBorrowerLoansView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsOfficer]
    serializer_class = LoanSerializer

    def get_queryset(self):
        return (
            Loan.objects.filter(borrower_id=self.kwargs["borrower_id"])
            .select_related("loan_type", "reviewed_by")
            .prefetch_related("payments")
        )


class OfficerBorrowerPaymentsView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsOfficer]
    serializer_class = PaymentSerializer

    def get_queryset(self):
        return Payment.objects.filter(
            borrower_id=self.kwargs["borrower_id"]
        ).select_related("loan", "recorded_by")

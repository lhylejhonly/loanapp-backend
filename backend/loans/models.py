from decimal import Decimal

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    def create_user(self, username, email, password=None, **extra_fields):
        if not username:
            raise ValueError("Username is required.")
        if not email:
            raise ValueError("Email is required.")

        username = username.strip().lower()
        email = self.normalize_email(email)
        approval_status = extra_fields.get("approval_status", User.ApprovalStatus.APPROVED)
        if approval_status == User.ApprovalStatus.APPROVED and "approved_at" not in extra_fields:
            extra_fields["approved_at"] = timezone.now()
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("approval_status", User.ApprovalStatus.APPROVED)
        extra_fields.setdefault("approved_at", timezone.now())

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(username, email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        BORROWER = "borrower", "Borrower"
        OFFICER = "officer", "Loan Officer"
        ADMIN = "admin", "Admin"

    class ApprovalStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class EmploymentStatus(models.TextChoices):
        EMPLOYED = "employed", "Employed"
        SELF_EMPLOYED = "self_employed", "Self Employed"
        STUDENT = "student", "Student"
        UNEMPLOYED = "unemployed", "Unemployed"

    class VerificationStatus(models.TextChoices):
        NOT_STARTED = "not_started", "Not Started"
        QUALIFIED = "qualified", "Qualified"
        NOT_QUALIFIED = "not_qualified", "Not Qualified"

    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=255)
    profile_photo = models.FileField(upload_to="profile_photos/", blank=True)
    phone_number = models.CharField(max_length=30, blank=True)
    sms_notifications_enabled = models.BooleanField(default=False)
    gcash_account_name = models.CharField(max_length=255, blank=True)
    gcash_account_number = models.CharField(max_length=30, blank=True)
    employment_status = models.CharField(max_length=20, choices=EmploymentStatus.choices, blank=True)
    monthly_income = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    monthly_debt = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.NOT_STARTED,
    )
    verification_updated_at = models.DateField(null=True, blank=True)
    email_verified = models.BooleanField(default=True)
    email_verification_code = models.CharField(max_length=10, blank=True)
    email_verification_expires_at = models.DateTimeField(null=True, blank=True)
    email_verification_last_sent_at = models.DateTimeField(null=True, blank=True)
    email_verification_send_window_started_at = models.DateTimeField(null=True, blank=True)
    email_verification_send_count = models.PositiveSmallIntegerField(default=0)
    email_verification_attempt_count = models.PositiveSmallIntegerField(default=0)
    email_verification_locked_until = models.DateTimeField(null=True, blank=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.BORROWER)
    approval_status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.APPROVED,
    )
    approved_by = models.ForeignKey(
        "self",
        related_name="approved_users",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email", "name"]

    class Meta:
        ordering = ["-date_joined"]

    def __str__(self):
        return f"{self.username} ({self.email})"


class LoanType(models.Model):
    name = models.CharField(max_length=120, unique=True)
    min_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("1.00"))],
    )
    max_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("1.00"))],
    )
    base_interest_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    terms_months = models.JSONField(default=list)
    required_documents = models.JSONField(default=list)  # e.g. ["government_id", "student_id"]
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Loan(models.Model):
    class ApplicationPurpose(models.TextChoices):
        PURCHASE = "purchase", "Purchase"
        REFINANCE = "refinance", "Refinance"
        BOTH = "both", "Both"

    class ApplicantCount(models.TextChoices):
        ONE = "one", "Just Me"
        TWO = "two", "2 of Us"
        MANY = "many", "3+ People"

    class DisbursementProvider(models.TextChoices):
        MANUAL = "manual", "Manual"
        XENDIT = "xendit", "Xendit"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    class DisbursementMethod(models.TextChoices):
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        GCASH = "gcash", "GCash"
        MAYA = "maya", "Maya"
        CASH_PICKUP = "cash_pickup", "Cash Pickup"

    class DisbursementStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        DISBURSED = "disbursed", "Disbursed"
        FAILED = "failed", "Failed"
        REVERSED = "reversed", "Reversed"

    borrower = models.ForeignKey(
        User,
        related_name="borrower_loans",
        on_delete=models.CASCADE,
        limit_choices_to={"role": User.Role.BORROWER},
    )
    borrower_name = models.CharField(max_length=255)
    loan_type = models.ForeignKey(LoanType, related_name="loans", on_delete=models.PROTECT)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("1.00"))],
    )
    interest_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    term_months = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    reviewed_by = models.ForeignKey(
        User,
        related_name="reviewed_loans",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role": User.Role.OFFICER},
    )
    rejection_reason = models.TextField(blank=True)
    application_purpose = models.CharField(
        max_length=20,
        choices=ApplicationPurpose.choices,
        blank=True,
        default="",
    )
    applicant_count = models.CharField(
        max_length=20,
        choices=ApplicantCount.choices,
        blank=True,
        default="",
    )
    contact_email = models.EmailField(blank=True, default="")
    contact_phone_number = models.CharField(max_length=30, blank=True, default="")
    disbursement_method = models.CharField(
        max_length=20,
        choices=DisbursementMethod.choices,
        default=DisbursementMethod.BANK_TRANSFER,
    )
    disbursement_account_name = models.CharField(max_length=255, blank=True)
    disbursement_account_number = models.CharField(max_length=120, blank=True)
    disbursement_status = models.CharField(
        max_length=20,
        choices=DisbursementStatus.choices,
        default=DisbursementStatus.PENDING,
    )
    disbursement_provider = models.CharField(
        max_length=20,
        choices=DisbursementProvider.choices,
        default=DisbursementProvider.MANUAL,
    )
    disbursement_reference = models.CharField(max_length=120, blank=True)
    disbursement_external_id = models.CharField(max_length=120, blank=True)
    disbursement_provider_status = models.CharField(max_length=40, blank=True)
    disbursement_failure_code = models.CharField(max_length=80, blank=True)
    disbursement_failure_message = models.TextField(blank=True)
    disbursement_requested_at = models.DateTimeField(null=True, blank=True)
    disbursed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Loan #{self.pk} - {self.borrower_name}"


class Payment(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        GCASH = "gcash", "GCash"
        MAYA = "maya", "Maya"

    loan = models.ForeignKey(Loan, related_name="payments", on_delete=models.CASCADE)
    borrower = models.ForeignKey(
        User,
        related_name="borrower_payments",
        on_delete=models.CASCADE,
        limit_choices_to={"role": User.Role.BORROWER},
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    date = models.DateField(default=timezone.now)
    recorded_by = models.ForeignKey(
        User,
        related_name="recorded_payments",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role": User.Role.OFFICER},
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
    )
    payment_reference = models.CharField(max_length=120, blank=True)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"Payment #{self.pk} - {self.amount}"


class PaymentSubmission(models.Model):
    class ReviewStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    loan = models.ForeignKey(Loan, related_name="payment_submissions", on_delete=models.CASCADE)
    borrower = models.ForeignKey(
        User,
        related_name="payment_submissions",
        on_delete=models.CASCADE,
        limit_choices_to={"role": User.Role.BORROWER},
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    payment_method = models.CharField(
        max_length=20,
        choices=Payment.PaymentMethod.choices,
        default=Payment.PaymentMethod.CASH,
    )
    payment_reference = models.CharField(max_length=120, blank=True)
    note = models.CharField(max_length=255, blank=True)
    proof_file_name = models.CharField(max_length=255, blank=True)
    proof_file = models.FileField(upload_to="payment_submissions/", null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=ReviewStatus.choices,
        default=ReviewStatus.PENDING,
    )
    reviewed_by = models.ForeignKey(
        User,
        related_name="reviewed_payment_submissions",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role__in": [User.Role.OFFICER, User.Role.ADMIN]},
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    approved_payment = models.OneToOneField(
        Payment,
        related_name="source_submission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-submitted_at", "-pk"]

    def __str__(self):
        return f"Payment submission #{self.pk} - {self.amount}"


class BorrowerAccountRequest(models.Model):
    class RequestType(models.TextChoices):
        DATA_EXPORT = "data_export", "Data Export"
        ACCOUNT_DELETION = "account_deletion", "Account Deletion"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        REJECTED = "rejected", "Rejected"

    borrower = models.ForeignKey(
        User,
        related_name="account_requests",
        on_delete=models.CASCADE,
        limit_choices_to={"role": User.Role.BORROWER},
    )
    request_type = models.CharField(max_length=30, choices=RequestType.choices)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    note = models.TextField(blank=True, default="")
    admin_note = models.TextField(blank=True, default="")
    resolved_by = models.ForeignKey(
        User,
        related_name="resolved_account_requests",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role__in": [User.Role.OFFICER, User.Role.ADMIN]},
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-pk"]

    def __str__(self):
        return f"{self.borrower.email} - {self.request_type}"


class PasswordResetToken(models.Model):
    user = models.ForeignKey(User, related_name="password_reset_tokens", on_delete=models.CASCADE)
    token = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"PasswordResetToken for {self.user.email}"


class BorrowerDocument(models.Model):
    class DocumentType(models.TextChoices):
        ID = "id", "ID"
        INCOME_PROOF = "income_proof", "Proof of Income"
        GOVERNMENT_ID = "government_id", "Government ID"
        STUDENT_ID = "student_id", "Student ID"
        BUSINESS_PERMIT = "business_permit", "Business Permit"
        BUSINESS_OWNER_ID = "business_owner_id", "Business Owner ID"
        PROOF_OF_REVENUE = "proof_of_revenue", "Proof of Monthly Revenue"

    class VerificationStatus(models.TextChoices):
        UPLOADED = "uploaded", "Uploaded"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"

    borrower = models.ForeignKey(
        User,
        related_name="documents",
        on_delete=models.CASCADE,
        limit_choices_to={"role": User.Role.BORROWER},
    )
    document_type = models.CharField(max_length=20, choices=DocumentType.choices)
    file_name = models.CharField(max_length=255)
    file = models.FileField(upload_to="borrower_documents/", null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.UPLOADED,
    )
    verified_by = models.ForeignKey(
        User,
        related_name="verified_documents",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={"role__in": [User.Role.OFFICER, User.Role.ADMIN]},
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.borrower.email} - {self.document_type}"


class Notification(models.Model):
    class Type(models.TextChoices):
        SYSTEM = "system", "System"
        LOAN = "loan", "Loan"
        PAYMENT = "payment", "Payment"
        DOCUMENT = "document", "Document"

    user = models.ForeignKey(User, related_name="notifications", on_delete=models.CASCADE)
    title = models.CharField(max_length=120)
    message = models.TextField()
    notification_type = models.CharField(
        max_length=20,
        choices=Type.choices,
        default=Type.SYSTEM,
    )
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.email} - {self.title}"

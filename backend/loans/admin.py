from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

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

admin.site.site_header = "Loan App Administration"
admin.site.site_title = "Loan App Admin"
admin.site.index_title = "Operational Dashboard"


class LoanTypeAdminForm(forms.ModelForm):
    terms_months_input = forms.CharField(
        label="Terms in months",
        help_text="Enter comma-separated months, for example: 6, 12, 24.",
        widget=forms.TextInput(),
    )
    required_documents_input = forms.MultipleChoiceField(
        label="Required documents",
        required=False,
        choices=BorrowerDocument.DocumentType.choices,
        widget=forms.CheckboxSelectMultiple,
        help_text="Select the borrower documents required before application.",
    )

    class Meta:
        model = LoanType
        fields = (
            "name",
            "min_amount",
            "max_amount",
            "base_interest_rate",
            "terms_months_input",
            "required_documents_input",
            "is_active",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        instance = kwargs.get("instance")

        if instance and instance.pk:
            self.fields["terms_months_input"].initial = ", ".join(str(term) for term in instance.terms_months)
            self.fields["required_documents_input"].initial = instance.required_documents
        else:
            self.fields["terms_months_input"].initial = "6, 12, 24"

    def clean_terms_months_input(self):
        raw_value = self.cleaned_data["terms_months_input"]
        normalized_terms: list[int] = []

        for part in raw_value.split(","):
            candidate = part.strip()
            if not candidate:
                continue

            try:
                term = int(candidate)
            except ValueError as exc:
                raise forms.ValidationError(
                    "Enter months as comma-separated whole numbers, for example: 6, 12, 24."
                ) from exc

            if term <= 0:
                raise forms.ValidationError("Each repayment term must be greater than zero.")

            normalized_terms.append(term)

        if not normalized_terms:
            raise forms.ValidationError("Enter at least one repayment term.")

        return sorted(set(normalized_terms))

    def save(self, commit=True):
        instance = super().save(commit=False)
        instance.terms_months = self.cleaned_data["terms_months_input"]
        instance.required_documents = self.cleaned_data.get("required_documents_input", [])

        if commit:
            instance.save()
            self.save_m2m()

        return instance


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("-date_joined",)
    list_display = (
        "username",
        "email",
        "name",
        "phone_number",
        "gcash_account_number",
        "role",
        "approval_status",
        "verification_status",
        "is_active",
        "is_staff",
        "date_joined",
    )
    list_filter = (
        "role",
        "approval_status",
        "verification_status",
        "sms_notifications_enabled",
        "is_active",
        "is_staff",
        "is_superuser",
    )
    search_fields = ("username", "email", "name", "phone_number", "gcash_account_number")

    fieldsets = (
        (None, {"fields": ("username", "email", "password")}),
        (
            "Personal Info",
            {
                "fields": (
                    "name",
                    "role",
                    "approval_status",
                    "approved_by",
                    "approved_at",
                    "phone_number",
                    "sms_notifications_enabled",
                    "gcash_account_name",
                    "gcash_account_number",
                )
            },
        ),
        (
            "Verification",
            {
                "fields": (
                    "verification_status",
                    "verification_updated_at",
                    "employment_status",
                    "monthly_income",
                    "monthly_debt",
                )
            },
        ),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "username",
                    "email",
                    "name",
                    "role",
                    "approval_status",
                    "phone_number",
                    "sms_notifications_enabled",
                    "gcash_account_name",
                    "gcash_account_number",
                    "password1",
                    "password2",
                    "is_staff",
                    "is_active",
                ),
            },
        ),
    )

    filter_horizontal = ("groups", "user_permissions")

    def has_module_permission(self, request):
        return bool(request.user and request.user.is_active and request.user.is_superuser)

    def has_view_permission(self, request, obj=None):
        return bool(request.user and request.user.is_active and request.user.is_superuser)

    def has_add_permission(self, request):
        return bool(request.user and request.user.is_active and request.user.is_superuser)

    def has_change_permission(self, request, obj=None):
        return bool(request.user and request.user.is_active and request.user.is_superuser)

    def has_delete_permission(self, request, obj=None):
        return bool(request.user and request.user.is_active and request.user.is_superuser)


@admin.register(LoanType)
class LoanTypeAdmin(admin.ModelAdmin):
    form = LoanTypeAdminForm
    list_display = ("name", "min_amount", "max_amount", "base_interest_rate", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(Loan)
class LoanAdmin(admin.ModelAdmin):
    list_display = ("id", "borrower_name", "loan_type", "amount", "balance", "status", "interest_rate", "created_at")
    list_filter = ("status", "loan_type", "created_at")
    search_fields = ("borrower_name", "borrower__email", "borrower__username")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("id", "loan", "borrower", "amount", "date", "recorded_by")
    list_filter = ("date", "recorded_by")
    search_fields = ("borrower__email", "borrower__username", "loan__id")


@admin.register(PaymentSubmission)
class PaymentSubmissionAdmin(admin.ModelAdmin):
    list_display = ("id", "loan", "borrower", "amount", "payment_method", "status", "submitted_at")
    list_filter = ("status", "payment_method", "submitted_at", "reviewed_by")
    search_fields = ("borrower__email", "borrower__username", "loan__id", "payment_reference")


@admin.register(BorrowerDocument)
class BorrowerDocumentAdmin(admin.ModelAdmin):
    list_display = ("id", "borrower", "document_type", "status", "uploaded_at")
    list_filter = ("document_type", "status")
    search_fields = ("borrower__email", "borrower__username", "file_name")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "title", "notification_type", "is_read", "created_at")
    list_filter = ("notification_type", "is_read", "created_at")
    search_fields = ("user__email", "user__username", "title")


@admin.register(BorrowerAccountRequest)
class BorrowerAccountRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "borrower", "request_type", "status", "resolved_by", "created_at")
    list_filter = ("request_type", "status", "created_at", "resolved_by")
    search_fields = ("borrower__email", "borrower__username", "note", "admin_note")

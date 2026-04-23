from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from loans.models import BorrowerDocument, Loan, LoanType, Notification, Payment, User


class Command(BaseCommand):
    help = "Seed demo data for the loan management backend."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing app data before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            Payment.objects.all().delete()
            Loan.objects.all().delete()
            BorrowerDocument.objects.all().delete()
            Notification.objects.all().delete()
            LoanType.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()
            self.stdout.write(self.style.WARNING("Existing demo data removed."))

        admin_user, _ = User.objects.get_or_create(
            email="admin@loanapp.com",
            defaults={
                "username": "admin",
                "name": "System Admin",
                "phone_number": "+15550001001",
                "role": User.Role.ADMIN,
                "is_active": True,
                "is_staff": True,
            },
        )
        admin_user.set_password("admin123")
        admin_user.username = "admin"
        admin_user.name = "System Admin"
        admin_user.phone_number = "+15550001001"
        admin_user.role = User.Role.ADMIN
        admin_user.is_staff = True
        admin_user.is_superuser = False
        admin_user.is_active = True
        admin_user.save()

        officer_user, _ = User.objects.get_or_create(
            email="officer@loanapp.com",
            defaults={
                "username": "officer",
                "name": "Loan Officer",
                "phone_number": "+15550001002",
                "role": User.Role.OFFICER,
                "is_active": True,
            },
        )
        officer_user.set_password("officer123")
        officer_user.username = "officer"
        officer_user.name = "Loan Officer"
        officer_user.phone_number = "+15550001002"
        officer_user.role = User.Role.OFFICER
        officer_user.is_active = True
        officer_user.save()

        borrower_user, _ = User.objects.get_or_create(
            email="borrower@loanapp.com",
            defaults={
                "username": "borrower",
                "name": "John Borrower",
                "phone_number": "+15550001003",
                "sms_notifications_enabled": True,
                "employment_status": User.EmploymentStatus.EMPLOYED,
                "monthly_income": Decimal("4200.00"),
                "monthly_debt": Decimal("900.00"),
                "verification_status": User.VerificationStatus.QUALIFIED,
                "role": User.Role.BORROWER,
                "is_active": True,
            },
        )
        borrower_user.set_password("borrower123")
        borrower_user.username = "borrower"
        borrower_user.name = "John Borrower"
        borrower_user.phone_number = "+15550001003"
        borrower_user.sms_notifications_enabled = True
        borrower_user.gcash_account_name = "John Borrower"
        borrower_user.gcash_account_number = "09171234567"
        borrower_user.employment_status = User.EmploymentStatus.EMPLOYED
        borrower_user.monthly_income = Decimal("4200.00")
        borrower_user.monthly_debt = Decimal("900.00")
        borrower_user.verification_status = User.VerificationStatus.QUALIFIED
        borrower_user.role = User.Role.BORROWER
        borrower_user.is_active = True
        borrower_user.save()

        student_loan, _ = LoanType.objects.update_or_create(
            name="Student Loan",
            defaults={
                "min_amount": Decimal("5000.00"),
                "max_amount": Decimal("50000.00"),
                "base_interest_rate": Decimal("4.50"),
                "terms_months": [6, 12, 24],
                "is_active": True,
            },
        )

        entrepreneur_loan, _ = LoanType.objects.update_or_create(
            name="Entrepreneur Loan",
            defaults={
                "min_amount": Decimal("20000.00"),
                "max_amount": Decimal("150000.00"),
                "base_interest_rate": Decimal("6.20"),
                "terms_months": [12, 24, 36],
                "is_active": True,
            },
        )

        LoanType.objects.update_or_create(
            name="Home Loan",
            defaults={
                "min_amount": Decimal("100000.00"),
                "max_amount": Decimal("2000000.00"),
                "base_interest_rate": Decimal("5.80"),
                "terms_months": [60, 120, 180, 240],
                "is_active": True,
            },
        )

        LoanType.objects.update_or_create(
            name="Car Loan",
            defaults={
                "min_amount": Decimal("80000.00"),
                "max_amount": Decimal("1200000.00"),
                "base_interest_rate": Decimal("5.25"),
                "terms_months": [12, 24, 36, 48, 60],
                "is_active": True,
            },
        )

        legacy_business_loan = LoanType.objects.filter(name="Business Loan").first()
        if legacy_business_loan:
            legacy_business_loan.is_active = False
            legacy_business_loan.save(update_fields=["is_active", "updated_at"])

        approved_loan, _ = Loan.objects.get_or_create(
            borrower=borrower_user,
            loan_type=student_loan,
            amount=Decimal("40000.00"),
            defaults={
                "borrower_name": borrower_user.name,
                "interest_rate": Decimal("5.10"),
                "term_months": 12,
                "status": Loan.Status.APPROVED,
                "balance": Decimal("32000.00"),
                "reviewed_by": officer_user,
            },
        )

        Loan.objects.get_or_create(
            borrower=borrower_user,
            loan_type=entrepreneur_loan,
            amount=Decimal("25000.00"),
            defaults={
                "borrower_name": borrower_user.name,
                "interest_rate": Decimal("6.20"),
                "term_months": 12,
                "status": Loan.Status.PENDING,
                "balance": Decimal("25000.00"),
            },
        )

        Payment.objects.get_or_create(
            loan=approved_loan,
            borrower=borrower_user,
            amount=Decimal("8000.00"),
            recorded_by=officer_user,
            defaults={"note": "Bank transfer"},
        )

        BorrowerDocument.objects.get_or_create(
            borrower=borrower_user,
            document_type=BorrowerDocument.DocumentType.ID,
            file_name="national-id-john.pdf",
            defaults={"status": BorrowerDocument.VerificationStatus.VERIFIED},
        )
        BorrowerDocument.objects.get_or_create(
            borrower=borrower_user,
            document_type=BorrowerDocument.DocumentType.INCOME_PROOF,
            file_name="payslip-john.pdf",
            defaults={"status": BorrowerDocument.VerificationStatus.UPLOADED},
        )

        Notification.objects.get_or_create(
            user=borrower_user,
            title="Welcome",
            defaults={
                "message": "Welcome to Loan App. You can now apply for a loan.",
                "notification_type": Notification.Type.SYSTEM,
                "is_read": False,
            },
        )

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))

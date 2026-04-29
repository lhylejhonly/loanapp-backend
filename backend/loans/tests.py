from calendar import monthrange
from datetime import date, timedelta
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from io import BytesIO
from PIL import Image, ImageDraw
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from loans.models import (
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
from loans.email_verification import EmailVerificationError, send_email_verification_code
from loans.serializers import refresh_borrower_verification_status


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


class PublicEndpointTests(APITestCase):
    def test_health_endpoint_returns_ok(self):
        response = self.client.get(reverse("health-check"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")


class RegistrationTests(APITestCase):
    def test_register_accepts_camel_case_payload(self):
        payload = {
            "userName": "janeclient",
            "name": "Jane Client",
            "email": "jane@example.com",
            "password": "Secure@123",
            "phoneNumber": "+1 (555) 000-1005",
            "smsEnabled": True,
        }

        response = self.client.post(reverse("register"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="jane@example.com")
        self.assertEqual(user.username, "janeclient")
        self.assertEqual(user.phone_number, "+15550001005")
        self.assertTrue(user.sms_notifications_enabled)
        self.assertFalse(user.email_verified)
        self.assertEqual(user.approval_status, User.ApprovalStatus.APPROVED)
        self.assertTrue(user.is_active)

    def test_register_requires_phone_if_sms_enabled(self):
        payload = {
            "username": "nophone",
            "name": "No Phone",
            "email": "nophone@example.com",
            "password": "Secure@123",
            "smsEnabled": True,
        }

        response = self.client.post(reverse("register"), payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_password_without_required_complexity(self):
        payload = {
            "username": "weakpassuser",
            "name": "Weak Password",
            "email": "weak.password@example.com",
            "password": "weakpass1",
            "phone_number": "+15550001077",
        }

        response = self.client.post(reverse("register"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Password must be at least 8 characters", str(response.data))

    def test_register_then_login_works_repeatedly(self):
        email = "repeat.login@example.com"
        password = "Secure@123"
        register_payload = {
            "username": "repeatlogin",
            "name": "Repeat Login",
            "email": email,
            "password": password,
            "phone_number": "+15550001006",
            "sms_notifications_enabled": False,
        }
        login_payload = {
            "username": "repeatlogin",
            "password": password,
        }

        register_response = self.client.post(reverse("register"), register_payload, format="json")
        self.assertEqual(register_response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email=email)
        user.email_verified = True
        user.approval_status = User.ApprovalStatus.APPROVED
        user.is_active = True
        user.approved_at = timezone.now()
        user.save(update_fields=["email_verified", "approval_status", "is_active", "approved_at"])

        first_login = self.client.post(reverse("login"), login_payload, format="json")
        second_login = self.client.post(reverse("login"), login_payload, format="json")

        self.assertEqual(first_login.status_code, status.HTTP_200_OK)
        self.assertEqual(second_login.status_code, status.HTTP_200_OK)

    def test_login_accepts_trimmed_email_and_password(self):
        email = "trim.login@example.com"
        username = "trimlogin"
        password = "trimmedpass123"
        User.objects.create_user(
            username=username,
            email=email,
            password=password,
            name="Trim Login",
            role=User.Role.BORROWER,
        )

        response = self.client.post(
            reverse("login"),
            {"username": f"  {username.upper()}  ", "password": f"  {password}  "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_login_rejects_unverified_email(self):
        User.objects.create_user(
            username="pendingverify",
            email="pending.verify@example.com",
            password="securepass123",
            name="Pending Verify",
            email_verified=False,
            role=User.Role.BORROWER,
        )

        response = self.client.post(
            reverse("login"),
            {"username": "pendingverify", "password": "securepass123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_rejects_pending_super_admin_approval(self):
        User.objects.create_user(
            username="pendingapproval",
            email="pending.approval@example.com",
            password="securepass123",
            name="Pending Approval",
            email_verified=True,
            role=User.Role.BORROWER,
            is_active=False,
            approval_status=User.ApprovalStatus.PENDING,
            approved_at=None,
        )

        response = self.client.post(
            reverse("login"),
            {"username": "pendingapproval", "password": "securepass123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(str(response.data["detail"]), "Your account is waiting for super admin approval.")

    def test_login_accepts_legacy_username_with_spaces_and_case(self):
        User.objects.create_user(
            username="legacyadmin",
            email="legacy.admin@example.com",
            password="loan@123",
            name="Legacy Admin",
            role=User.Role.ADMIN,
            is_staff=True,
            email_verified=True,
        )
        legacy_user = User.objects.get(email="legacy.admin@example.com")
        legacy_user.username = "LOAN ADMIN"
        legacy_user.save(update_fields=["username"])

        response = self.client.post(
            reverse("login"),
            {"username": "loan admin", "password": "loan@123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class EmailVerificationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="verifyuser",
            email="verify@example.com",
            password="securepass123",
            name="Verify User",
            phone_number="+15550001009",
            email_verified=False,
            role=User.Role.BORROWER,
        )

    @patch("loans.views.generate_verification_code", return_value="123456")
    @patch("loans.views.send_email_verification_code")
    def test_send_email_verification_code(self, mock_send_email_verification_code, mock_generate_verification_code):
        response = self.client.post(
            reverse("send-verification-code"),
            {"email": self.user.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["cooldown_seconds"], 60)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email_verification_code, "123456")
        self.assertIsNotNone(self.user.email_verification_expires_at)
        self.assertIsNotNone(self.user.email_verification_last_sent_at)
        self.assertEqual(self.user.email_verification_send_count, 1)
        mock_generate_verification_code.assert_called_once_with()
        mock_send_email_verification_code.assert_called_once_with(
            recipient_email=self.user.email,
            recipient_name=self.user.name,
            code="123456",
        )

    def test_verify_email_code(self):
        self.user.email_verification_code = "123456"
        self.user.email_verification_expires_at = timezone.now() + timedelta(minutes=10)
        self.user.save(update_fields=["email_verification_code", "email_verification_expires_at"])

        response = self.client.post(
            reverse("verify-email-code"),
            {"email": self.user.email, "code": "123456"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["verified"])
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)
        self.assertEqual(self.user.email_verification_code, "")
        self.assertIsNone(self.user.email_verification_expires_at)
        self.assertIsNotNone(self.user.email_verified_at)

    def test_verify_email_code_rejects_invalid_code(self):
        self.user.email_verification_code = "123456"
        self.user.email_verification_expires_at = timezone.now() + timedelta(minutes=10)
        self.user.save(update_fields=["email_verification_code", "email_verification_expires_at"])

        response = self.client.post(
            reverse("verify-email-code"),
            {"email": self.user.email, "code": "0000"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verified)
        self.assertEqual(self.user.email_verification_attempt_count, 1)

    def test_verify_email_code_rejects_expired_code(self):
        self.user.email_verification_code = "123456"
        self.user.email_verification_expires_at = timezone.now() - timedelta(minutes=1)
        self.user.save(update_fields=["email_verification_code", "email_verification_expires_at"])

        response = self.client.post(
            reverse("verify-email-code"),
            {"email": self.user.email, "code": "123456"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email_verification_code, "")
        self.assertIsNone(self.user.email_verification_expires_at)

    @patch("loans.views.generate_verification_code", return_value="123456")
    @patch("loans.views.send_email_verification_code")
    def test_send_email_verification_code_enforces_cooldown(
        self,
        mock_send_email_verification_code,
        mock_generate_verification_code,
    ):
        first_response = self.client.post(
            reverse("send-verification-code"),
            {"email": self.user.email},
            format="json",
        )
        second_response = self.client.post(
            reverse("send-verification-code"),
            {"email": self.user.email},
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(second_response.data["code"], "verification_send_cooldown")
        self.assertIn("retry_after_seconds", second_response.data)
        mock_send_email_verification_code.assert_called_once()
        mock_generate_verification_code.assert_called_once()

    @patch("loans.views.send_email_verification_code")
    def test_send_email_verification_code_enforces_hourly_limit(self, mock_send_email_verification_code):
        now = timezone.now()
        self.user.email_verification_send_window_started_at = now - timedelta(minutes=30)
        self.user.email_verification_send_count = 5
        self.user.email_verification_last_sent_at = now - timedelta(minutes=2)
        self.user.save(
            update_fields=[
                "email_verification_send_window_started_at",
                "email_verification_send_count",
                "email_verification_last_sent_at",
            ]
        )

        response = self.client.post(
            reverse("send-verification-code"),
            {"email": self.user.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data["code"], "verification_send_limit_reached")
        self.assertIn("retry_after_seconds", response.data)
        mock_send_email_verification_code.assert_not_called()

    @override_settings(
        EMAIL_VERIFICATION_MAX_VERIFY_ATTEMPTS=5,
        EMAIL_VERIFICATION_LOCKOUT_MINUTES=15,
    )
    @patch("loans.views.send_email_verification_code")
    def test_verify_email_code_locks_after_too_many_attempts(self, mock_send_email_verification_code):
        self.user.email_verification_code = "123456"
        self.user.email_verification_expires_at = timezone.now() + timedelta(minutes=10)
        self.user.save(update_fields=["email_verification_code", "email_verification_expires_at"])

        last_response = None
        for _ in range(5):
            last_response = self.client.post(
                reverse("verify-email-code"),
                {"email": self.user.email, "code": "000000"},
                format="json",
            )

        self.assertIsNotNone(last_response)
        self.assertEqual(last_response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(last_response.data["code"], "verification_locked")
        self.assertIn("retry_after_seconds", last_response.data)

        self.user.refresh_from_db()
        self.assertEqual(self.user.email_verification_attempt_count, 5)
        self.assertIsNotNone(self.user.email_verification_locked_until)

        resend_response = self.client.post(
            reverse("send-verification-code"),
            {"email": self.user.email},
            format="json",
        )

        self.assertEqual(resend_response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(resend_response.data["code"], "verification_locked")
        mock_send_email_verification_code.assert_not_called()


class PasswordResetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="resetuser",
            email="reset.user@example.com",
            password="Secure@123",
            name="Reset User",
            phone_number="+15550001012",
            email_verified=True,
            role=User.Role.BORROWER,
        )

    @patch("loans.views.send_email_verification_code")
    def test_forgot_password_emails_same_code_that_is_saved(self, mock_send_email_verification_code):
        response = self.client.post(
            reverse("forgot-password"),
            {"email": self.user.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("token", response.data)
        reset_token = PasswordResetToken.objects.get(user=self.user, used=False)
        self.assertEqual(len(reset_token.token), 8)
        self.assertTrue(reset_token.token.isdigit())
        mock_send_email_verification_code.assert_called_once_with(
            recipient_email=self.user.email,
            recipient_name=self.user.name,
            code=reset_token.token,
        )

    @patch("loans.views.send_email_verification_code")
    def test_reset_password_accepts_emailed_code(self, mock_send_email_verification_code):
        self.client.post(
            reverse("forgot-password"),
            {"email": self.user.email},
            format="json",
        )
        reset_token = PasswordResetToken.objects.get(user=self.user, used=False)

        response = self.client.post(
            reverse("reset-password"),
            {"token": reset_token.token, "new_password": "Stronger@456"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        reset_token.refresh_from_db()
        self.assertTrue(self.user.check_password("Stronger@456"))
        self.assertTrue(reset_token.used)
        mock_send_email_verification_code.assert_called_once()

    @patch("loans.views.send_email_verification_code")
    def test_reset_password_rejects_weak_password(self, mock_send_email_verification_code):
        self.client.post(
            reverse("forgot-password"),
            {"email": self.user.email},
            format="json",
        )
        reset_token = PasswordResetToken.objects.get(user=self.user, used=False)

        response = self.client.post(
            reverse("reset-password"),
            {"token": reset_token.token, "new_password": "weakpass1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Password must be at least 8 characters", str(response.data))
        mock_send_email_verification_code.assert_called_once()


class BorrowerSelfServiceTests(APITestCase):
    def setUp(self):
        self.borrower = User.objects.create_user(
            username="borrowerselfservice",
            email="borrower.selfservice@example.com",
            password="Secure@123",
            name="Borrower Self Service",
            role=User.Role.BORROWER,
            is_active=True,
            email_verified=True,
        )
        self.client.force_authenticate(user=self.borrower)

    def test_authenticated_user_can_change_password(self):
        response = self.client.post(
            reverse("change-password"),
            {
                "currentPassword": "Secure@123",
                "newPassword": "Newer@456",
                "confirmNewPassword": "Newer@456",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.borrower.refresh_from_db()
        self.assertTrue(self.borrower.check_password("Newer@456"))
        self.assertTrue(
            Notification.objects.filter(
                user=self.borrower,
                title="Password Updated",
                notification_type=Notification.Type.SYSTEM,
            ).exists()
        )

    def test_change_password_rejects_invalid_current_password(self):
        response = self.client.post(
            reverse("change-password"),
            {
                "current_password": "wrong-password",
                "new_password": "Newer@456",
                "confirm_new_password": "Newer@456",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.borrower.refresh_from_db()
        self.assertTrue(self.borrower.check_password("Secure@123"))

    def test_borrower_can_submit_account_request(self):
        response = self.client.post(
            reverse("borrower-account-requests"),
            {
                "requestType": BorrowerAccountRequest.RequestType.DATA_EXPORT,
                "note": "Please send a copy of my borrower data.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        account_request = BorrowerAccountRequest.objects.get(borrower=self.borrower)
        self.assertEqual(account_request.request_type, BorrowerAccountRequest.RequestType.DATA_EXPORT)
        self.assertEqual(account_request.status, BorrowerAccountRequest.Status.PENDING)
        self.assertTrue(
            Notification.objects.filter(
                user=self.borrower,
                title="Account Request Submitted",
                notification_type=Notification.Type.SYSTEM,
            ).exists()
        )

    def test_duplicate_active_account_request_is_rejected(self):
        BorrowerAccountRequest.objects.create(
            borrower=self.borrower,
            request_type=BorrowerAccountRequest.RequestType.ACCOUNT_DELETION,
            status=BorrowerAccountRequest.Status.PENDING,
        )

        response = self.client.post(
            reverse("borrower-account-requests"),
            {
                "request_type": BorrowerAccountRequest.RequestType.ACCOUNT_DELETION,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            BorrowerAccountRequest.objects.filter(
                borrower=self.borrower,
                request_type=BorrowerAccountRequest.RequestType.ACCOUNT_DELETION,
            ).count(),
            1,
        )


class ContactMessageTests(APITestCase):
    def setUp(self):
        self.borrower = User.objects.create_user(
            username="contactborrower",
            email="contact.borrower@example.com",
            password="Secure@123",
            name="Contact Borrower",
            role=User.Role.BORROWER,
            is_active=True,
            email_verified=True,
        )
        self.officer = User.objects.create_user(
            username="contactofficer",
            email="contact.officer@example.com",
            password="Secure@123",
            name="Contact Officer",
            role=User.Role.OFFICER,
            is_active=True,
            email_verified=True,
        )

    def test_borrower_can_send_contact_message(self):
        self.client.force_authenticate(user=self.borrower)

        response = self.client.post(
            reverse("borrower-messages"),
            {
                "subject": "Need help with verification",
                "message": "I want to confirm which ID I should upload.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_message = ContactMessage.objects.get(sender=self.borrower)
        self.assertEqual(created_message.subject, "Need help with verification")
        self.assertEqual(created_message.status, ContactMessage.Status.UNREAD)
        self.assertTrue(
            Notification.objects.filter(
                user=self.officer,
                title="New Message from Borrower",
                notification_type=Notification.Type.SYSTEM,
            ).exists()
        )

    def test_staff_cannot_send_borrower_contact_message(self):
        self.client.force_authenticate(user=self.officer)

        response = self.client.post(
            reverse("borrower-messages"),
            {
                "subject": "Internal note",
                "message": "This should not be accepted here.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ContactMessage.objects.filter(sender=self.officer).exists())


class MeEndpointTests(APITestCase):
    def setUp(self):
        self.borrower = User.objects.create_user(
            username="borrowerme",
            email="borrower.me@example.com",
            password="securepass123",
            name="Borrower Me",
            role=User.Role.BORROWER,
            phone_number="+15550001010",
            sms_notifications_enabled=False,
            email_verified=True,
        )

    def test_authenticated_user_can_update_profile_and_verification_inputs(self):
        self.client.force_authenticate(user=self.borrower)
        profile_photo = SimpleUploadedFile(
            "avatar.png",
            b"\x89PNG\r\n\x1a\navatar",
            content_type="image/png",
        )

        response = self.client.patch(
            reverse("me"),
            {
                "phoneNumber": "+1 (555) 000-5555",
                "smsNotificationsEnabled": True,
                "gcashAccountName": "Borrower Me",
                "gcashAccountNumber": "9171234567",
                "employmentStatus": "employed",
                "monthlyIncome": "3500.00",
                "monthlyDebt": "900.00",
                "profile_photo": profile_photo,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.borrower.refresh_from_db()
        self.assertEqual(self.borrower.phone_number, "+15550005555")
        self.assertTrue(self.borrower.sms_notifications_enabled)
        self.assertEqual(self.borrower.gcash_account_name, "Borrower Me")
        self.assertEqual(self.borrower.gcash_account_number, "09171234567")
        self.assertEqual(self.borrower.verification_status, User.VerificationStatus.NOT_QUALIFIED)
        self.assertIsNotNone(self.borrower.verification_updated_at)
        self.assertTrue(self.borrower.profile_photo.name.startswith("profile_photos/"))
        self.assertIn("/media/profile_photos/", response.data["profile_photo_url"])

    def test_profile_update_requires_gcash_name_when_number_is_present(self):
        self.client.force_authenticate(user=self.borrower)

        response = self.client.patch(
            reverse("me"),
            {
                "gcashAccountName": "",
                "gcashAccountNumber": "09171234567",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "gcash_account_name is required when saving a GCash payout profile.",
            str(response.data),
        )


class EmailVerificationProviderTests(SimpleTestCase):
    @override_settings(
        EMAIL_VERIFICATION_PROVIDER="brevo",
        EMAIL_HOST="smtp-relay.brevo.com",
        EMAIL_PORT=587,
        EMAIL_HOST_USER="sender@example.com",
        EMAIL_HOST_PASSWORD="smtp-key",
        DEFAULT_FROM_EMAIL="sender@example.com",
        EMAIL_USE_TLS=True,
        EMAIL_USE_SSL=False,
        EMAIL_TIMEOUT=15,
        EMAIL_VERIFICATION_SUBJECT="Your verification code",
    )
    @patch("loans.email_verification.EmailMultiAlternatives.send", return_value=1)
    def test_send_email_verification_code_with_brevo_provider(self, mock_send):
        send_email_verification_code(
            recipient_email="borrower@example.com",
            recipient_name="Borrower",
            code="123456",
        )

        mock_send.assert_called_once_with(fail_silently=False)

    @override_settings(
        EMAIL_VERIFICATION_PROVIDER="gmail",
        EMAIL_HOST="smtp.gmail.com",
        EMAIL_PORT=587,
        EMAIL_HOST_USER="sender@example.com",
        EMAIL_HOST_PASSWORD="app-password",
        DEFAULT_FROM_EMAIL="sender@example.com",
        EMAIL_USE_TLS=True,
        EMAIL_USE_SSL=False,
        EMAIL_TIMEOUT=15,
        EMAIL_VERIFICATION_SUBJECT="Your verification code",
    )
    @patch("loans.email_verification.EmailMultiAlternatives.send", return_value=1)
    def test_send_email_verification_code_with_gmail_provider(self, mock_send):
        send_email_verification_code(
            recipient_email="borrower@example.com",
            recipient_name="Borrower",
            code="123456",
        )

        mock_send.assert_called_once_with(fail_silently=False)

    @override_settings(
        EMAIL_VERIFICATION_PROVIDER="gmail",
        EMAIL_HOST="smtp.gmail.com",
        EMAIL_HOST_USER="",
        EMAIL_HOST_PASSWORD="",
        DEFAULT_FROM_EMAIL="",
    )
    def test_send_email_verification_code_requires_smtp_credentials(self):
        with self.assertRaises(EmailVerificationError):
            send_email_verification_code(
                recipient_email="borrower@example.com",
                recipient_name="Borrower",
                code="123456",
            )


class AdminLoanDecisionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="loanadminreview",
            email="loan.admin.review@example.com",
            password="securepass123",
            name="Loan Admin Review",
            role=User.Role.ADMIN,
            is_staff=True,
            is_active=True,
            email_verified=True,
        )
        self.borrower = User.objects.create_user(
            username="loanborrowerreview",
            email="loan.borrower.review@example.com",
            password="securepass123",
            name="Loan Borrower Review",
            role=User.Role.BORROWER,
            is_active=True,
            email_verified=True,
        )
        self.loan_type = LoanType.objects.create(
            name="Admin Review Loan",
            min_amount="1000.00",
            max_amount="10000.00",
            base_interest_rate="5.00",
            terms_months=[6, 12],
        )
        self.loan = Loan.objects.create(
            borrower=self.borrower,
            borrower_name=self.borrower.name,
            loan_type=self.loan_type,
            amount="5000.00",
            interest_rate="5.00",
            term_months=12,
            status=Loan.Status.PENDING,
            balance="5000.00",
        )

    def test_admin_can_approve_pending_loan(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("admin-loan-decision", args=[self.loan.pk]),
            {
                "approve": True,
                "interest_rate": "6.75",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.status, Loan.Status.APPROVED)
        self.assertEqual(str(self.loan.interest_rate), "6.75")
        self.assertEqual(self.loan.reviewed_by, self.admin)
        self.assertTrue(
            Notification.objects.filter(
                user=self.borrower,
                title="Loan Approved",
                notification_type=Notification.Type.LOAN,
            ).exists()
        )

    def test_admin_can_reject_pending_loan(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("admin-loan-decision", args=[self.loan.pk]),
            {
                "approve": False,
                "rejection_reason": "Incomplete supporting documents.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.status, Loan.Status.REJECTED)
        self.assertEqual(self.loan.rejection_reason, "Incomplete supporting documents.")
        self.assertEqual(self.loan.reviewed_by, self.admin)


class BorrowerDisbursementFlowTests(APITestCase):
    def setUp(self):
        self.borrower = User.objects.create_user(
            username="borrowerflow",
            email="borrower.flow@example.com",
            password="securepass123",
            name="Borrower Flow",
            role=User.Role.BORROWER,
            is_active=True,
            email_verified=True,
            gcash_account_name="Borrower Flow",
            gcash_account_number="09171234567",
            employment_status=User.EmploymentStatus.EMPLOYED,
            monthly_income="3500.00",
            monthly_debt="900.00",
        )
        self.officer = User.objects.create_user(
            username="officerflow",
            email="officer.flow@example.com",
            password="securepass123",
            name="Officer Flow",
            role=User.Role.OFFICER,
            is_active=True,
            email_verified=True,
        )
        self.loan_type = LoanType.objects.create(
            name="Flow Loan",
            min_amount="1000.00",
            max_amount="20000.00",
            base_interest_rate="5.00",
            terms_months=[6, 12],
        )
        self.loan = Loan.objects.create(
            borrower=self.borrower,
            borrower_name=self.borrower.name,
            loan_type=self.loan_type,
            amount="8000.00",
            interest_rate="5.00",
            term_months=12,
            status=Loan.Status.APPROVED,
            balance="8000.00",
            disbursement_method=Loan.DisbursementMethod.GCASH,
            disbursement_account_name="Borrower Flow",
            disbursement_account_number="09171234567",
        )
        BorrowerDocument.objects.create(
            borrower=self.borrower,
            document_type=BorrowerDocument.DocumentType.GOVERNMENT_ID,
            file_name="government-id.jpg",
            status=BorrowerDocument.VerificationStatus.VERIFIED,
        )
        BorrowerDocument.objects.create(
            borrower=self.borrower,
            document_type=BorrowerDocument.DocumentType.INCOME_PROOF,
            file_name="income-proof.pdf",
            status=BorrowerDocument.VerificationStatus.VERIFIED,
        )

    def test_borrower_can_apply_with_disbursement_details(self):
        self.client.force_authenticate(user=self.borrower)

        response = self.client.post(
            reverse("borrower-loans"),
            {
                "loan_type": self.loan_type.pk,
                "amount": "5000.00",
                "term_months": 6,
                "applicant_name": "Borrower Flow Jr.",
                "application_purpose": Loan.ApplicationPurpose.REFINANCE,
                "applicant_count": Loan.ApplicantCount.TWO,
                "contact_email": "coapplicant@example.com",
                "contact_phone_number": "+1 (555) 000-8888",
                "disbursement_method": Loan.DisbursementMethod.GCASH,
                "disbursement_account_name": "Borrower Flow",
                "disbursement_account_number": "09171234567",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_loan = Loan.objects.get(pk=response.data["id"])
        self.assertEqual(created_loan.disbursement_method, Loan.DisbursementMethod.GCASH)
        self.assertEqual(created_loan.disbursement_account_name, "Borrower Flow")
        self.assertEqual(created_loan.disbursement_account_number, "09171234567")
        self.assertEqual(created_loan.disbursement_status, Loan.DisbursementStatus.PENDING)
        self.assertEqual(created_loan.borrower_name, "Borrower Flow Jr.")
        self.assertEqual(created_loan.application_purpose, Loan.ApplicationPurpose.REFINANCE)
        self.assertEqual(created_loan.applicant_count, Loan.ApplicantCount.TWO)
        self.assertEqual(created_loan.contact_email, "coapplicant@example.com")
        self.assertEqual(created_loan.contact_phone_number, "+15550008888")

    def test_borrower_application_uses_saved_gcash_profile_when_disbursement_fields_are_omitted(self):
        self.client.force_authenticate(user=self.borrower)

        response = self.client.post(
            reverse("borrower-loans"),
            {
                "loan_type": self.loan_type.pk,
                "amount": "5000.00",
                "term_months": 6,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_loan = Loan.objects.get(pk=response.data["id"])
        self.assertEqual(created_loan.disbursement_method, Loan.DisbursementMethod.GCASH)
        self.assertEqual(created_loan.disbursement_account_name, "Borrower Flow")
        self.assertEqual(created_loan.disbursement_account_number, "09171234567")

    def test_borrower_application_accepts_government_id_for_generic_id_requirement(self):
        self.loan_type.required_documents = ["id"]
        self.loan_type.save(update_fields=["required_documents"])
        self.client.force_authenticate(user=self.borrower)

        response = self.client.post(
            reverse("borrower-loans"),
            {
                "loan_type": self.loan_type.pk,
                "amount": "5000.00",
                "term_months": 6,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_student_loan_does_not_require_income_proof(self):
        student_loan_type = LoanType.objects.create(
            name="Student Assistance Loan",
            min_amount="1000.00",
            max_amount="20000.00",
            base_interest_rate="5.00",
            terms_months=[6, 12],
            required_documents=["government_id", "student_id", "income_proof"],
        )
        self.borrower.employment_status = User.EmploymentStatus.STUDENT
        self.borrower.monthly_income = "3500.00"
        self.borrower.monthly_debt = "0.00"
        self.borrower.save(update_fields=["employment_status", "monthly_income", "monthly_debt"])
        BorrowerDocument.objects.filter(
            borrower=self.borrower,
            document_type=BorrowerDocument.DocumentType.INCOME_PROOF,
        ).delete()
        BorrowerDocument.objects.create(
            borrower=self.borrower,
            document_type=BorrowerDocument.DocumentType.STUDENT_ID,
            file_name="student-id.jpg",
            status=BorrowerDocument.VerificationStatus.VERIFIED,
        )
        self.client.force_authenticate(user=self.borrower)

        response = self.client.post(
            reverse("borrower-loans"),
            {
                "loan_type": student_loan_type.pk,
                "amount": "5000.00",
                "term_months": 6,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_borrower_application_defaults_to_gcash_when_method_is_omitted(self):
        self.client.force_authenticate(user=self.borrower)

        response = self.client.post(
            reverse("borrower-loans"),
            {
                "loan_type": self.loan_type.pk,
                "amount": "5000.00",
                "term_months": 6,
                "disbursement_account_name": "Borrower Flow",
                "disbursement_account_number": "9171234567",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_loan = Loan.objects.get(pk=response.data["id"])
        self.assertEqual(created_loan.disbursement_method, Loan.DisbursementMethod.GCASH)
        self.assertEqual(created_loan.disbursement_account_number, "09171234567")

    def test_borrower_application_rejects_non_gcash_disbursement_method(self):
        self.client.force_authenticate(user=self.borrower)

        response = self.client.post(
            reverse("borrower-loans"),
            {
                "loan_type": self.loan_type.pk,
                "amount": "5000.00",
                "term_months": 6,
                "disbursement_method": Loan.DisbursementMethod.MAYA,
                "disbursement_account_name": "Borrower Flow",
                "disbursement_account_number": "09171234567",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only GCash disbursement is available right now.", str(response.data))

    def test_borrower_loans_include_repayment_summary_before_release(self):
        self.client.force_authenticate(user=self.borrower)

        response = self.client.get(reverse("borrower-loans"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary = response.data["results"][0]["repayment_summary"]
        self.assertEqual(summary["scheduled_installment_amount"], "666.67")
        self.assertEqual(summary["paid_installments"], 0)
        self.assertEqual(summary["remaining_installments"], 12)
        self.assertEqual(summary["total_installments"], 12)
        self.assertIsNone(summary["repayment_start_date"])
        self.assertIsNone(summary["next_due_date"])
        self.assertIsNone(summary["maturity_date"])
        self.assertIsNone(summary["days_until_due"])
        self.assertFalse(summary["is_overdue"])
        self.assertEqual(summary["overdue_installments"], 0)

    def test_borrower_loans_include_due_dates_for_disbursed_loans(self):
        self.client.force_authenticate(user=self.borrower)
        disbursed_at = timezone.now() - timedelta(days=45)
        self.loan.balance = "6666.66"
        self.loan.disbursement_status = Loan.DisbursementStatus.DISBURSED
        self.loan.disbursed_at = disbursed_at
        self.loan.save(update_fields=["balance", "disbursement_status", "disbursed_at"])

        response = self.client.get(reverse("borrower-loans"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary = response.data["results"][0]["repayment_summary"]
        repayment_start_date = timezone.localdate(disbursed_at)
        expected_next_due_date = add_months(repayment_start_date, 3)
        expected_maturity_date = add_months(repayment_start_date, 12)

        self.assertEqual(summary["scheduled_installment_amount"], "666.67")
        self.assertEqual(summary["paid_installments"], 2)
        self.assertEqual(summary["remaining_installments"], 10)
        self.assertEqual(summary["total_installments"], 12)
        self.assertEqual(summary["repayment_start_date"], repayment_start_date.isoformat())
        self.assertEqual(summary["next_due_date"], expected_next_due_date.isoformat())
        self.assertEqual(summary["maturity_date"], expected_maturity_date.isoformat())
        self.assertEqual(summary["days_until_due"], (expected_next_due_date - timezone.localdate()).days)
        self.assertFalse(summary["is_overdue"])
        self.assertEqual(summary["overdue_installments"], 0)

    def test_payment_requires_disbursement_before_recording(self):
        self.client.force_authenticate(user=self.officer)

        response = self.client.post(
            reverse("officer-record-payment"),
            {
                "loan_id": self.loan.pk,
                "amount": "1000.00",
                "payment_method": Payment.PaymentMethod.GCASH,
                "payment_reference": "GCASH-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("disbursed", str(response.data))

    def test_officer_can_disburse_then_record_payment(self):
        self.client.force_authenticate(user=self.officer)

        disbursement_response = self.client.post(
            reverse("officer-record-disbursement"),
            {
                "loan_id": self.loan.pk,
                "disbursement_reference": "GCASH-REL-001",
            },
            format="json",
        )

        self.assertEqual(disbursement_response.status_code, status.HTTP_200_OK)
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.disbursement_status, Loan.DisbursementStatus.DISBURSED)
        self.assertEqual(self.loan.disbursement_reference, "GCASH-REL-001")
        self.assertIsNotNone(self.loan.disbursed_at)
        self.assertTrue(
            Notification.objects.filter(
                user=self.borrower,
                title="Loan Released",
                notification_type=Notification.Type.LOAN,
            ).exists()
        )

        payment_response = self.client.post(
            reverse("officer-record-payment"),
            {
                "loan_id": self.loan.pk,
                "amount": "1500.00",
                "payment_method": Payment.PaymentMethod.GCASH,
                "payment_reference": "GCASH-PAY-001",
                "note": "Borrower paid via GCash.",
            },
            format="json",
        )

        self.assertEqual(payment_response.status_code, status.HTTP_201_CREATED)
        self.loan.refresh_from_db()
        self.assertEqual(str(self.loan.balance), "6500.00")
        payment = Payment.objects.get(loan=self.loan)
        self.assertEqual(payment.payment_method, Payment.PaymentMethod.GCASH)
        self.assertEqual(payment.payment_reference, "GCASH-PAY-001")

    def test_borrower_can_submit_pending_payment_request(self):
        self.loan.disbursement_status = Loan.DisbursementStatus.DISBURSED
        self.loan.disbursed_at = timezone.now()
        self.loan.save(update_fields=["disbursement_status", "disbursed_at"])
        self.client.force_authenticate(user=self.borrower)

        response = self.client.post(
            reverse("borrower-payment-submissions"),
            {
                "loan_id": self.loan.pk,
                "amount": "1250.00",
                "payment_method": Payment.PaymentMethod.GCASH,
                "payment_reference": "GCASH-PENDING-001",
                "note": "Borrower submitted proof for review.",
                "proof_file_name": "gcash-proof.jpg",
                "proof_file": SimpleUploadedFile(
                    "gcash-proof.jpg",
                    b"payment-proof",
                    content_type="image/jpeg",
                ),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        submission = PaymentSubmission.objects.get(loan=self.loan, borrower=self.borrower)
        self.assertEqual(submission.status, PaymentSubmission.ReviewStatus.PENDING)
        self.assertEqual(submission.payment_reference, "GCASH-PENDING-001")
        self.assertIsNone(submission.approved_payment)
        self.loan.refresh_from_db()
        self.assertEqual(str(self.loan.balance), "8000.00")
        self.assertTrue(
            Notification.objects.filter(
                user=self.officer,
                title="Payment Review Needed",
                notification_type=Notification.Type.PAYMENT,
            ).exists()
        )

        payments_response = self.client.get(reverse("borrower-payments"))
        self.assertEqual(payments_response.status_code, status.HTTP_200_OK)
        self.assertEqual(payments_response.data["count"], 0)

    def test_officer_can_approve_payment_submission(self):
        self.loan.disbursement_status = Loan.DisbursementStatus.DISBURSED
        self.loan.disbursed_at = timezone.now()
        self.loan.save(update_fields=["disbursement_status", "disbursed_at"])
        submission = PaymentSubmission.objects.create(
            loan=self.loan,
            borrower=self.borrower,
            amount="1500.00",
            payment_method=Payment.PaymentMethod.GCASH,
            payment_reference="GCASH-SUBMIT-001",
            note="Submitted by borrower for approval.",
        )
        self.client.force_authenticate(user=self.officer)

        response = self.client.post(reverse("officer-approve-payment-submission", args=[submission.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        submission.refresh_from_db()
        self.loan.refresh_from_db()
        self.assertEqual(submission.status, PaymentSubmission.ReviewStatus.APPROVED)
        self.assertIsNotNone(submission.approved_payment_id)
        self.assertEqual(str(self.loan.balance), "6500.00")
        payment = Payment.objects.get(pk=submission.approved_payment_id)
        self.assertEqual(payment.payment_reference, "GCASH-SUBMIT-001")
        self.assertTrue(
            Notification.objects.filter(
                user=self.borrower,
                title="Payment Approved",
                notification_type=Notification.Type.PAYMENT,
            ).exists()
        )

    def test_officer_can_reject_payment_submission(self):
        self.loan.disbursement_status = Loan.DisbursementStatus.DISBURSED
        self.loan.disbursed_at = timezone.now()
        self.loan.save(update_fields=["disbursement_status", "disbursed_at"])
        submission = PaymentSubmission.objects.create(
            loan=self.loan,
            borrower=self.borrower,
            amount="1500.00",
            payment_method=Payment.PaymentMethod.GCASH,
            payment_reference="GCASH-SUBMIT-REJECT",
        )
        self.client.force_authenticate(user=self.officer)

        response = self.client.post(
            reverse("officer-reject-payment-submission", args=[submission.pk]),
            {"rejection_reason": "Proof was unreadable."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        submission.refresh_from_db()
        self.loan.refresh_from_db()
        self.assertEqual(submission.status, PaymentSubmission.ReviewStatus.REJECTED)
        self.assertEqual(submission.rejection_reason, "Proof was unreadable.")
        self.assertIsNone(submission.approved_payment)
        self.assertEqual(str(self.loan.balance), "8000.00")
        self.assertEqual(Payment.objects.filter(loan=self.loan).count(), 0)


class OfficerOperationsTests(APITestCase):
    def setUp(self):
        self.officer = User.objects.create_user(
            username="officerops",
            email="officer.ops@example.com",
            password="securepass123",
            name="Officer Ops",
            role=User.Role.OFFICER,
            is_active=True,
            email_verified=True,
        )
        self.borrower = User.objects.create_user(
            username="borrowerops",
            email="borrower.ops@example.com",
            password="securepass123",
            name="Borrower Ops",
            role=User.Role.BORROWER,
            is_active=True,
            email_verified=True,
        )
        self.loan_type = LoanType.objects.create(
            name="Officer Ops Loan",
            min_amount="1000.00",
            max_amount="50000.00",
            base_interest_rate="5.50",
            terms_months=[6, 12, 24],
        )
        self.pending_loan = Loan.objects.create(
            borrower=self.borrower,
            borrower_name=self.borrower.name,
            loan_type=self.loan_type,
            amount="12000.00",
            interest_rate="5.50",
            term_months=12,
            status=Loan.Status.PENDING,
            balance="12000.00",
            disbursement_method=Loan.DisbursementMethod.GCASH,
            disbursement_account_name=self.borrower.name,
            disbursement_account_number="09171234567",
            disbursement_status=Loan.DisbursementStatus.PENDING,
        )
        self.approved_loan = Loan.objects.create(
            borrower=self.borrower,
            borrower_name=self.borrower.name,
            loan_type=self.loan_type,
            amount="8000.00",
            interest_rate="6.25",
            term_months=6,
            status=Loan.Status.APPROVED,
            balance="5000.00",
            reviewed_by=self.officer,
            disbursement_method=Loan.DisbursementMethod.GCASH,
            disbursement_account_name=self.borrower.name,
            disbursement_account_number="09171234567",
            disbursement_status=Loan.DisbursementStatus.DISBURSED,
        )
        self.rejected_loan = Loan.objects.create(
            borrower=self.borrower,
            borrower_name=self.borrower.name,
            loan_type=self.loan_type,
            amount="3000.00",
            interest_rate="5.50",
            term_months=6,
            status=Loan.Status.REJECTED,
            balance="3000.00",
            reviewed_by=self.officer,
            rejection_reason="Insufficient documents.",
            disbursement_method=Loan.DisbursementMethod.GCASH,
            disbursement_account_name=self.borrower.name,
            disbursement_account_number="09171234567",
            disbursement_status=Loan.DisbursementStatus.PENDING,
        )
        self.document = BorrowerDocument.objects.create(
            borrower=self.borrower,
            document_type=BorrowerDocument.DocumentType.ID,
            file_name="nic-front.jpg",
            status=BorrowerDocument.VerificationStatus.UPLOADED,
        )

    def test_officer_applications_list_returns_pending_approved_and_rejected_loans(self):
        self.client.force_authenticate(user=self.officer)

        response = self.client.get(reverse("officer-applications"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        returned_ids = {entry["id"] for entry in results}
        returned_statuses = {entry["status"] for entry in results}
        self.assertSetEqual(returned_ids, {self.pending_loan.pk, self.approved_loan.pk, self.rejected_loan.pk})
        self.assertSetEqual(
            returned_statuses,
            {Loan.Status.PENDING, Loan.Status.APPROVED, Loan.Status.REJECTED},
        )

    def test_officer_can_approve_pending_loan_with_interest_rate(self):
        self.client.force_authenticate(user=self.officer)

        response = self.client.post(
            reverse("officer-loan-decision", args=[self.pending_loan.pk]),
            {"approve": True, "interest_rate": "7.25"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.pending_loan.refresh_from_db()
        self.assertEqual(self.pending_loan.status, Loan.Status.APPROVED)
        self.assertEqual(str(self.pending_loan.interest_rate), "7.25")
        self.assertEqual(self.pending_loan.reviewed_by, self.officer)

    def test_officer_can_toggle_borrower_status(self):
        self.client.force_authenticate(user=self.officer)

        response = self.client.post(reverse("officer-toggle-borrower-status", args=[self.borrower.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.borrower.refresh_from_db()
        self.assertFalse(self.borrower.is_active)

    def test_officer_can_verify_borrower_document(self):
        self.client.force_authenticate(user=self.officer)

        response = self.client.post(reverse("officer-verify-document", args=[self.document.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.document.refresh_from_db()
        self.assertEqual(self.document.status, BorrowerDocument.VerificationStatus.VERIFIED)
        self.assertEqual(self.document.verified_by, self.officer)
        self.assertIsNotNone(self.document.verified_at)
        self.assertTrue(
            Notification.objects.filter(
                user=self.borrower,
                title="Document Verified",
                notification_type=Notification.Type.DOCUMENT,
            ).exists()
        )

    def test_officer_verifying_latest_required_documents_can_qualify_borrower(self):
        self.borrower.employment_status = User.EmploymentStatus.EMPLOYED
        self.borrower.monthly_income = "3500.00"
        self.borrower.monthly_debt = "400.00"
        self.borrower.save(update_fields=["employment_status", "monthly_income", "monthly_debt"])
        income_document = BorrowerDocument.objects.create(
            borrower=self.borrower,
            document_type=BorrowerDocument.DocumentType.INCOME_PROOF,
            file_name="income-proof.pdf",
            status=BorrowerDocument.VerificationStatus.UPLOADED,
        )

        self.client.force_authenticate(user=self.officer)

        first_response = self.client.post(reverse("officer-verify-document", args=[self.document.pk]))

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.borrower.refresh_from_db()
        self.assertEqual(self.borrower.verification_status, User.VerificationStatus.NOT_QUALIFIED)

        second_response = self.client.post(reverse("officer-verify-document", args=[income_document.pk]))

        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.borrower.refresh_from_db()
        self.assertEqual(self.borrower.verification_status, User.VerificationStatus.QUALIFIED)
        self.assertIsNotNone(self.borrower.verification_updated_at)


class BorrowerDocumentUploadValidationTests(APITestCase):
    def setUp(self):
        self.borrower = User.objects.create_user(
            username="documentborrower",
            email="document.borrower@example.com",
            password="securepass123",
            name="Document Borrower",
            role=User.Role.BORROWER,
            is_active=True,
            email_verified=True,
        )
        self.client.force_authenticate(user=self.borrower)

    def _build_document_image(self, filename="government-id.jpg", size=(1200, 760)):
        image = Image.new("RGB", size, "#F8FAFC")
        draw = ImageDraw.Draw(image)
        draw.rectangle((70, 60, size[0] - 70, size[1] - 60), outline="#0F172A", width=8)
        draw.rectangle((110, 120, 360, 430), fill="#CBD5E1", outline="#0F172A", width=5)
        draw.rectangle((410, 150, size[0] - 140, 190), fill="#0EA5E9")
        draw.text((420, 230), "REPUBLIC IDENTIFICATION CARD", fill="#111827")
        draw.text((420, 320), "JUAN DELA CRUZ", fill="#111827")
        draw.text((420, 410), "1234-5678-90", fill="#111827")

        payload = BytesIO()
        image.save(payload, format="JPEG", quality=92)
        return SimpleUploadedFile(filename, payload.getvalue(), content_type="image/jpeg")

    def test_borrower_can_upload_valid_government_id_image(self):
        response = self.client.post(
            reverse("borrower-documents"),
            {
                "document_type": BorrowerDocument.DocumentType.GOVERNMENT_ID,
                "file_name": "government-id.jpg",
                "file": self._build_document_image(),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["document_type"], BorrowerDocument.DocumentType.GOVERNMENT_ID)

    def test_borrower_document_upload_accepts_non_image_government_id_in_test_mode(self):
        response = self.client.post(
            reverse("borrower-documents"),
            {
                "document_type": BorrowerDocument.DocumentType.GOVERNMENT_ID,
                "file_name": "government-id.pdf",
                "file": SimpleUploadedFile("government-id.pdf", b"%PDF-1.4 fake pdf", content_type="application/pdf"),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["document_type"], BorrowerDocument.DocumentType.GOVERNMENT_ID)

    def test_borrower_document_upload_accepts_low_resolution_government_id_in_test_mode(self):
        response = self.client.post(
            reverse("borrower-documents"),
            {
                "document_type": BorrowerDocument.DocumentType.GOVERNMENT_ID,
                "file_name": "small-government-id.jpg",
                "file": self._build_document_image(filename="small-government-id.jpg", size=(640, 360)),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["document_type"], BorrowerDocument.DocumentType.GOVERNMENT_ID)

    def test_uploading_a_new_latest_government_id_removes_qualified_status_until_reverified(self):
        self.borrower.employment_status = User.EmploymentStatus.EMPLOYED
        self.borrower.monthly_income = "4000.00"
        self.borrower.monthly_debt = "500.00"
        self.borrower.save(update_fields=["employment_status", "monthly_income", "monthly_debt"])
        BorrowerDocument.objects.create(
            borrower=self.borrower,
            document_type=BorrowerDocument.DocumentType.GOVERNMENT_ID,
            file_name="verified-government-id.jpg",
            status=BorrowerDocument.VerificationStatus.VERIFIED,
        )
        BorrowerDocument.objects.create(
            borrower=self.borrower,
            document_type=BorrowerDocument.DocumentType.INCOME_PROOF,
            file_name="verified-income-proof.pdf",
            status=BorrowerDocument.VerificationStatus.VERIFIED,
        )
        refresh_borrower_verification_status(self.borrower)
        self.borrower.refresh_from_db()
        self.assertEqual(self.borrower.verification_status, User.VerificationStatus.QUALIFIED)

        response = self.client.post(
            reverse("borrower-documents"),
            {
                "document_type": BorrowerDocument.DocumentType.GOVERNMENT_ID,
                "file_name": "replacement-government-id.jpg",
                "file": self._build_document_image(filename="replacement-government-id.jpg"),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.borrower.refresh_from_db()
        self.assertEqual(self.borrower.verification_status, User.VerificationStatus.NOT_QUALIFIED)


class AutomatedXenditPayoutTests(APITestCase):
    def setUp(self):
        self.borrower = User.objects.create_user(
            username="borrowerxendit",
            email="borrower.xendit@example.com",
            password="securepass123",
            name="Borrower Xendit",
            role=User.Role.BORROWER,
            is_active=True,
            email_verified=True,
        )
        self.officer = User.objects.create_user(
            username="officerxendit",
            email="officer.xendit@example.com",
            password="securepass123",
            name="Officer Xendit",
            role=User.Role.OFFICER,
            is_active=True,
            email_verified=True,
        )
        self.loan_type = LoanType.objects.create(
            name="Xendit Loan",
            min_amount="1000.00",
            max_amount="50000.00",
            base_interest_rate="4.50",
            terms_months=[6, 12],
        )
        self.loan = Loan.objects.create(
            borrower=self.borrower,
            borrower_name=self.borrower.name,
            loan_type=self.loan_type,
            amount="9000.00",
            interest_rate="4.50",
            term_months=12,
            status=Loan.Status.APPROVED,
            balance="9000.00",
            disbursement_method=Loan.DisbursementMethod.GCASH,
            disbursement_account_name="Borrower Xendit",
            disbursement_account_number="09171234567",
        )

    @override_settings(
        DISBURSEMENT_PROVIDER="xendit",
        XENDIT_SECRET_KEY="xnd_test_secret",
        XENDIT_WEBHOOK_TOKEN="whsec_test_token",
        XENDIT_GCASH_CHANNEL_CODE="PH_GCASH",
    )
    @patch("loans.payouts._request_json")
    def test_officer_release_starts_provider_payout(self, mock_request_json):
        mock_request_json.return_value = {
            "id": "disb-test-123",
            "reference_id": "loan-automated-123",
            "status": "ACCEPTED",
        }

        self.client.force_authenticate(user=self.officer)
        response = self.client.post(
            reverse("officer-record-disbursement"),
            {"loan_id": self.loan.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.disbursement_provider, Loan.DisbursementProvider.XENDIT)
        self.assertEqual(self.loan.disbursement_status, Loan.DisbursementStatus.PROCESSING)
        self.assertEqual(self.loan.disbursement_external_id, "disb-test-123")
        self.assertEqual(self.loan.disbursement_provider_status, "ACCEPTED")
        self.assertTrue(self.loan.disbursement_reference.startswith("loan-"))
        self.assertIsNotNone(self.loan.disbursement_requested_at)
        self.assertTrue(
            Notification.objects.filter(
                user=self.borrower,
                title="Loan Payout Processing",
                notification_type=Notification.Type.LOAN,
            ).exists()
        )

    @override_settings(
        DISBURSEMENT_PROVIDER="xendit",
        XENDIT_SECRET_KEY="xnd_test_secret",
        XENDIT_WEBHOOK_TOKEN="whsec_test_token",
        XENDIT_GCASH_CHANNEL_CODE="PH_GCASH",
    )
    def test_xendit_webhook_marks_loan_disbursed(self):
        self.loan.disbursement_provider = Loan.DisbursementProvider.XENDIT
        self.loan.disbursement_status = Loan.DisbursementStatus.PROCESSING
        self.loan.disbursement_reference = "loan-automated-123"
        self.loan.disbursement_external_id = "disb-test-123"
        self.loan.disbursement_provider_status = "ACCEPTED"
        self.loan.save(
            update_fields=[
                "disbursement_provider",
                "disbursement_status",
                "disbursement_reference",
                "disbursement_external_id",
                "disbursement_provider_status",
            ]
        )

        response = self.client.post(
            reverse("xendit-payout-webhook"),
            {
                "event": "payout.succeeded",
                "data": {
                    "id": "disb-test-123",
                    "reference_id": "loan-automated-123",
                    "status": "SUCCEEDED",
                },
            },
            format="json",
            HTTP_X_CALLBACK_TOKEN="whsec_test_token",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.disbursement_status, Loan.DisbursementStatus.DISBURSED)
        self.assertEqual(self.loan.disbursement_provider_status, "SUCCEEDED")
        self.assertIsNotNone(self.loan.disbursed_at)
        self.assertTrue(
            Notification.objects.filter(
                user=self.borrower,
                title="Loan Released",
                notification_type=Notification.Type.LOAN,
            ).exists()
        )

    @override_settings(
        DISBURSEMENT_PROVIDER="xendit",
        XENDIT_SECRET_KEY="xnd_test_secret",
        XENDIT_WEBHOOK_TOKEN="whsec_test_token",
        XENDIT_GCASH_CHANNEL_CODE="PH_GCASH",
    )
    def test_xendit_webhook_marks_loan_failed(self):
        self.loan.disbursement_provider = Loan.DisbursementProvider.XENDIT
        self.loan.disbursement_status = Loan.DisbursementStatus.PROCESSING
        self.loan.disbursement_reference = "loan-automated-124"
        self.loan.disbursement_external_id = "disb-test-124"
        self.loan.disbursement_provider_status = "ACCEPTED"
        self.loan.save(
            update_fields=[
                "disbursement_provider",
                "disbursement_status",
                "disbursement_reference",
                "disbursement_external_id",
                "disbursement_provider_status",
            ]
        )

        response = self.client.post(
            reverse("xendit-payout-webhook"),
            {
                "event": "payout.failed",
                "data": {
                    "id": "disb-test-124",
                    "reference_id": "loan-automated-124",
                    "status": "FAILED",
                    "failure_code": "INSUFFICIENT_BALANCE",
                    "failure_message": "Insufficient payout balance.",
                },
            },
            format="json",
            HTTP_X_CALLBACK_TOKEN="whsec_test_token",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.disbursement_status, Loan.DisbursementStatus.FAILED)
        self.assertEqual(self.loan.disbursement_failure_code, "INSUFFICIENT_BALANCE")
        self.assertEqual(self.loan.disbursement_failure_message, "Insufficient payout balance.")
        self.assertTrue(
            Notification.objects.filter(
                user=self.borrower,
                title="Loan Release Failed",
                notification_type=Notification.Type.LOAN,
            ).exists()
        )


class AdminLoanTypeManagementTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="loantypeadmin",
            email="loan.type.admin@example.com",
            password="Secure@123",
            name="Loan Type Admin",
            role=User.Role.ADMIN,
            is_staff=True,
            is_active=True,
            email_verified=True,
        )
        self.loan_type = LoanType.objects.create(
            name="Editable Loan Type",
            min_amount="1000.00",
            max_amount="15000.00",
            base_interest_rate="5.50",
            terms_months=[6, 12],
            required_documents=["id"],
        )

    def test_admin_can_update_required_documents(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse("admin-loan-type-detail", args=[self.loan_type.pk]),
            {"required_documents": ["government_id", "student_id", "government_id"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.loan_type.refresh_from_db()
        self.assertEqual(self.loan_type.required_documents, ["government_id", "student_id"])

    def test_admin_cannot_save_unknown_required_document(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse("admin-loan-type-detail", args=[self.loan_type.pk]),
            {"required_documents": ["passport"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.loan_type.refresh_from_db()
        self.assertEqual(self.loan_type.required_documents, ["id"])


class UserDeletionTests(APITestCase):
    def test_deleting_officer_preserves_payment_history(self):
        borrower = User.objects.create_user(
            username="borrowerdelete",
            email="borrower.delete@example.com",
            password="securepass123",
            name="Borrower Delete",
            role=User.Role.BORROWER,
        )
        officer = User.objects.create_user(
            username="officerdelete",
            email="officer.delete@example.com",
            password="securepass123",
            name="Officer Delete",
            role=User.Role.OFFICER,
        )
        loan_type = LoanType.objects.create(
            name="Delete Test Loan",
            min_amount="1000.00",
            max_amount="10000.00",
            base_interest_rate="5.00",
            terms_months=[6, 12],
        )
        loan = Loan.objects.create(
            borrower=borrower,
            borrower_name=borrower.name,
            loan_type=loan_type,
            amount="5000.00",
            interest_rate="5.00",
            term_months=6,
            status=Loan.Status.APPROVED,
            balance="3000.00",
        )
        payment = Payment.objects.create(
            loan=loan,
            borrower=borrower,
            amount="2000.00",
            recorded_by=officer,
        )

        officer.delete()

        payment.refresh_from_db()
        self.assertIsNone(payment.recorded_by)


class SuperAdminProvisioningTests(APITestCase):
    def setUp(self):
        self.super_admin = User.objects.create_superuser(
            username="superadmin",
            email="superadmin@example.com",
            password="supersecure123",
            name="Super Admin",
        )
        self.regular_admin = User.objects.create_user(
            username="regularadmin",
            email="regular.admin@example.com",
            password="adminpass123",
            name="Regular Admin",
            role=User.Role.ADMIN,
            is_active=True,
            is_staff=True,
            email_verified=True,
        )
        self.borrower = User.objects.create_user(
            username="borroweradminscope",
            email="borrower.scope@example.com",
            password="borrowerpass123",
            name="Borrower Scope",
            role=User.Role.BORROWER,
            is_active=True,
            email_verified=True,
        )

    def test_super_admin_can_create_admin_account(self):
        self.client.force_authenticate(user=self.super_admin)

        response = self.client.post(
            reverse("admin-users"),
            {
                "username": "newadmin",
                "name": "New Admin",
                "email": "new.admin@example.com",
                "password": "newadmin123",
                "phoneNumber": "+1 555 000 2001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_user = User.objects.get(username="newadmin")
        self.assertEqual(created_user.role, User.Role.ADMIN)
        self.assertFalse(created_user.is_superuser)
        self.assertTrue(created_user.is_staff)
        self.assertTrue(created_user.email_verified)
        self.assertEqual(created_user.approval_status, User.ApprovalStatus.APPROVED)

    def test_super_admin_can_approve_pending_user_and_assign_role(self):
        pending_user = User.objects.create_user(
            username="pendingrole",
            email="pending.role@example.com",
            password="pending123",
            name="Pending Role",
            role=User.Role.BORROWER,
            is_active=False,
            email_verified=True,
            approval_status=User.ApprovalStatus.PENDING,
            approved_at=None,
        )
        self.client.force_authenticate(user=self.super_admin)

        response = self.client.patch(
            reverse("admin-user-detail", args=[pending_user.pk]),
            {"approvalStatus": User.ApprovalStatus.APPROVED, "role": User.Role.OFFICER},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        pending_user.refresh_from_db()
        self.assertEqual(pending_user.approval_status, User.ApprovalStatus.APPROVED)
        self.assertEqual(pending_user.role, User.Role.OFFICER)
        self.assertTrue(pending_user.is_active)
        self.assertFalse(pending_user.is_staff)
        self.assertEqual(pending_user.approved_by, self.super_admin)
        self.assertIsNotNone(pending_user.approved_at)

    def test_regular_admin_cannot_approve_pending_user_or_assign_role(self):
        pending_user = User.objects.create_user(
            username="pendingblocked",
            email="pending.blocked@example.com",
            password="pending123",
            name="Pending Blocked",
            role=User.Role.BORROWER,
            is_active=False,
            email_verified=True,
            approval_status=User.ApprovalStatus.PENDING,
            approved_at=None,
        )
        self.client.force_authenticate(user=self.regular_admin)

        response = self.client.patch(
            reverse("admin-user-detail", args=[pending_user.pk]),
            {"approvalStatus": User.ApprovalStatus.APPROVED, "role": User.Role.ADMIN},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        pending_user.refresh_from_db()
        self.assertEqual(pending_user.approval_status, User.ApprovalStatus.PENDING)
        self.assertEqual(pending_user.role, User.Role.BORROWER)

    def test_regular_admin_cannot_create_admin_account(self):
        self.client.force_authenticate(user=self.regular_admin)

        response = self.client.post(
            reverse("admin-users"),
            {
                "username": "blockedadmin",
                "name": "Blocked Admin",
                "email": "blocked.admin@example.com",
                "password": "blockedadmin123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(username="blockedadmin").exists())

    def test_admin_user_list_excludes_superusers(self):
        self.client.force_authenticate(user=self.super_admin)

        response = self.client.get(reverse("admin-users"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        usernames = [entry["username"] for entry in results]
        self.assertIn(self.regular_admin.username, usernames)
        self.assertIn(self.borrower.username, usernames)
        self.assertNotIn(self.super_admin.username, usernames)

    def test_regular_admin_can_list_non_superusers(self):
        self.client.force_authenticate(user=self.regular_admin)

        response = self.client.get(reverse("admin-users"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        usernames = [entry["username"] for entry in results]
        self.assertIn(self.regular_admin.username, usernames)
        self.assertIn(self.borrower.username, usernames)
        self.assertNotIn(self.super_admin.username, usernames)

    def test_regular_admin_can_toggle_borrower_status(self):
        self.client.force_authenticate(user=self.regular_admin)

        response = self.client.patch(
            reverse("admin-user-detail", args=[self.borrower.pk]),
            {"active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.borrower.refresh_from_db()
        self.assertFalse(self.borrower.is_active)

    def test_admin_cannot_deactivate_own_account(self):
        self.client.force_authenticate(user=self.regular_admin)

        response = self.client.patch(
            reverse("admin-user-detail", args=[self.regular_admin.pk]),
            {"active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.regular_admin.refresh_from_db()
        self.assertTrue(self.regular_admin.is_active)

import html
import json
import logging
import secrets
import smtplib
import urllib.error
import urllib.request

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone

logger = logging.getLogger(__name__)

RESEND_SEND_EMAIL_URL = "https://api.resend.com/emails"


class EmailVerificationError(Exception):
    pass


def generate_verification_code() -> str:
    length = max(int(settings.EMAIL_VERIFICATION_CODE_LENGTH), 4)
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def _display_name(name: str) -> str:
    first_name = (name or "").strip().split(" ")[0]
    return html.escape(first_name or "there")


def _build_email_html(name: str, code: str) -> str:
    expires_in_minutes = int(settings.EMAIL_VERIFICATION_TTL_MINUTES)
    recipient_name = _display_name(name)
    escaped_code = html.escape(code)

    return f"""
    <div style="font-family: Arial, sans-serif; background: #f8fbff; padding: 32px 16px; color: #0f172a;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; padding: 32px 24px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);">
        <div style="font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #2563eb; margin-bottom: 12px;">
          ElevateFunds
        </div>
        <h1 style="font-size: 28px; line-height: 1.2; margin: 0 0 12px;">Verify your email</h1>
        <p style="font-size: 16px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
          Hi {recipient_name}, use the code below to complete your registration.
        </p>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; text-align: center; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 16px; padding: 20px 12px; color: #1d4ed8; margin: 0 0 20px;">
          {escaped_code}
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">
          This code expires in {expires_in_minutes} minutes. If you did not create an account, you can ignore this email.
        </p>
      </div>
    </div>
    """.strip()


def _build_email_text(name: str, code: str) -> str:
    expires_in_minutes = int(settings.EMAIL_VERIFICATION_TTL_MINUTES)
    recipient_name = (name or "").strip().split(" ")[0] or "there"
    return (
        f"Hi {recipient_name},\n\n"
        f"Your ElevateFunds verification code is: {code}\n\n"
        f"This code expires in {expires_in_minutes} minutes.\n"
        "If you did not create an account, you can ignore this email."
    )


def _build_email_subject() -> str:
    base_subject = (settings.EMAIL_VERIFICATION_SUBJECT or "Your ElevateFunds verification code").strip()
    issued_at = timezone.localtime().strftime("%Y-%m-%d %H:%M:%S")
    return f"{base_subject} [{issued_at}]"


def _extract_error_message(raw_body: str) -> str:
    if not raw_body:
        return ""

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return raw_body.strip()

    if isinstance(payload, dict):
        for key in ("message", "error"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    return raw_body.strip()


def _send_with_resend(recipient_email: str, recipient_name: str, code: str) -> None:
    if not settings.RESEND_API_KEY or not settings.RESEND_FROM_EMAIL:
        raise EmailVerificationError(
            "Email sending is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL in backend/.env."
        )

    payload = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [recipient_email],
        "subject": _build_email_subject(),
        "html": _build_email_html(recipient_name, code),
        "text": _build_email_text(recipient_name, code),
    }

    request = urllib.request.Request(
        RESEND_SEND_EMAIL_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response.read()
            if response.status < 200 or response.status >= 300:
                raise EmailVerificationError("Unable to send verification email right now.")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        message = _extract_error_message(error_body) or f"Resend request failed with status {exc.code}."
        logger.warning("Resend email send failed for %s: %s", recipient_email, message)
        raise EmailVerificationError(message) from exc
    except urllib.error.URLError as exc:
        logger.exception("Resend email send failed for %s", recipient_email)
        raise EmailVerificationError("Unable to send verification email right now. Please try again.") from exc


def _resolve_smtp_host() -> str:
    if settings.EMAIL_HOST:
        return settings.EMAIL_HOST

    if settings.EMAIL_VERIFICATION_PROVIDER == "gmail":
        return "smtp.gmail.com"

    if settings.EMAIL_VERIFICATION_PROVIDER == "brevo":
        return "smtp-relay.brevo.com"

    return ""


def _decode_smtp_response(exc: BaseException) -> str:
    response = getattr(exc, "smtp_error", "")
    if isinstance(response, bytes):
        response = response.decode("utf-8", errors="ignore")
    if not isinstance(response, str):
        response = str(response)
    return response.strip()


def _build_smtp_error_message(exc: BaseException) -> str:
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "Email provider rejected the SMTP login. Verify EMAIL_HOST_USER and EMAIL_HOST_PASSWORD."

    if isinstance(exc, smtplib.SMTPSenderRefused):
        provider_message = _decode_smtp_response(exc)
        if provider_message:
            return (
                "Email provider rejected DEFAULT_FROM_EMAIL. "
                f"Use a verified sender address. Provider message: {provider_message}"
            )
        return "Email provider rejected DEFAULT_FROM_EMAIL. Use a verified sender address."

    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return "Email provider rejected the recipient email address."

    if isinstance(exc, smtplib.SMTPDataError):
        provider_message = _decode_smtp_response(exc)
        if provider_message:
            return (
                "Email provider rejected the message while sending it. "
                f"Provider message: {provider_message}"
            )
        return "Email provider rejected the message while sending it."

    if isinstance(exc, smtplib.SMTPResponseException):
        provider_message = _decode_smtp_response(exc)
        if provider_message:
            return (
                "Email provider returned an SMTP error while sending the message. "
                f"Provider message: {provider_message}"
            )
        return "Email provider returned an SMTP error while sending the message."

    if isinstance(exc, TimeoutError):
        return "Email provider timed out while sending the message. Try again."

    if isinstance(exc, OSError):
        return "Unable to reach the email provider right now. Check the SMTP host, port, and network access."

    return (
        "Unable to send verification email right now. "
        "Check your email provider settings and sender setup, then try again."
    )


def _send_with_smtp(recipient_email: str, recipient_name: str, code: str) -> None:
    smtp_host = _resolve_smtp_host()
    if not smtp_host:
        raise EmailVerificationError(
            "Email sending is not configured. Add EMAIL_HOST in backend/.env."
        )

    if not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
        raise EmailVerificationError(
            "Email sending is not configured. Add EMAIL_HOST_USER and EMAIL_HOST_PASSWORD in backend/.env."
        )

    from_email = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER
    if not from_email:
        raise EmailVerificationError(
            "Email sending is not configured. Add DEFAULT_FROM_EMAIL or EMAIL_HOST_USER in backend/.env."
        )

    connection = get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=smtp_host,
        port=settings.EMAIL_PORT,
        username=settings.EMAIL_HOST_USER,
        password=settings.EMAIL_HOST_PASSWORD,
        use_tls=settings.EMAIL_USE_TLS,
        use_ssl=settings.EMAIL_USE_SSL,
        timeout=settings.EMAIL_TIMEOUT,
    )

    message = EmailMultiAlternatives(
        subject=_build_email_subject(),
        body=_build_email_text(recipient_name, code),
        from_email=from_email,
        to=[recipient_email],
        connection=connection,
    )
    message.attach_alternative(_build_email_html(recipient_name, code), "text/html")

    try:
        sent_count = message.send(fail_silently=False)
        if sent_count != 1:
            raise EmailVerificationError("Unable to send verification email right now.")
    except (smtplib.SMTPException, OSError, TimeoutError, ValueError) as exc:
        logger.exception("SMTP email send failed for %s", recipient_email)
        raise EmailVerificationError(_build_smtp_error_message(exc)) from exc


def send_email_verification_code(*, recipient_email: str, recipient_name: str, code: str) -> None:
    provider = settings.EMAIL_VERIFICATION_PROVIDER

    if provider in {"", "console"}:
        logger.info("Email verification code for %s is %s", recipient_email, code)
        return

    if provider == "resend":
        _send_with_resend(recipient_email, recipient_name, code)
        return

    if settings.EMAIL_HOST or provider in {"smtp", "gmail", "brevo"}:
        _send_with_smtp(recipient_email, recipient_name, code)
        return

    raise EmailVerificationError("Unsupported email verification provider.")


# ── Due date notification emails ──────────────────────────────────────────────

def _build_due_date_html(name: str, title: str, message: str, is_overdue: bool) -> str:
    recipient_name = _display_name(name)
    accent = "#DC2626" if is_overdue else "#0369A1"
    bg = "#FEF2F2" if is_overdue else "#EFF6FF"
    border = "#FECACA" if is_overdue else "#BFDBFE"
    icon = "⚠️" if is_overdue else "🔔"
    escaped_title = html.escape(title)
    escaped_message = html.escape(message)

    return f"""
    <div style="font-family: Arial, sans-serif; background: #f8fbff; padding: 32px 16px; color: #0f172a;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; padding: 32px 24px; box-shadow: 0 16px 40px rgba(15,23,42,0.08);">
        <div style="font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #2563eb; margin-bottom: 12px;">
          ElevateFunds
        </div>
        <h1 style="font-size: 24px; line-height: 1.2; margin: 0 0 12px; color: {accent};">
          {icon} {escaped_title}
        </h1>
        <div style="background: {bg}; border: 1px solid {border}; border-radius: 12px; padding: 16px; margin: 0 0 20px;">
          <p style="font-size: 15px; line-height: 1.7; color: #1e293b; margin: 0;">
            Hi {recipient_name},<br><br>{escaped_message}
          </p>
        </div>
        <p style="font-size: 13px; color: #64748b; margin: 0;">
          Log in to the ElevateFunds app to view your repayment schedule and make a payment.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          This is an automated reminder from ElevateFunds. Please do not reply to this email.
        </p>
      </div>
    </div>
    """.strip()


def _build_due_date_text(name: str, title: str, message: str) -> str:
    recipient_name = (name or "").strip().split(" ")[0] or "there"
    return (
        f"Hi {recipient_name},\n\n"
        f"{title}\n\n"
        f"{message}\n\n"
        "Log in to the ElevateFunds app to view your repayment schedule and make a payment.\n\n"
        "-- ElevateFunds Team"
    )


def send_due_date_notification_email(
    *,
    recipient_email: str,
    recipient_name: str,
    title: str,
    message: str,
    is_overdue: bool = False,
) -> None:
    """Send a payment due date reminder or overdue warning email."""
    provider = settings.EMAIL_VERIFICATION_PROVIDER

    if provider in {"", "console"}:
        logger.info(
            "[DUE DATE EMAIL] To: %s | %s | %s",
            recipient_email, title, message,
        )
        return

    subject = f"ElevateFunds: {title}"
    html_body = _build_due_date_html(recipient_name, title, message, is_overdue)
    text_body = _build_due_date_text(recipient_name, title, message)

    if provider == "resend":
        if not settings.RESEND_API_KEY or not settings.RESEND_FROM_EMAIL:
            logger.warning("Resend not configured — skipping due date email to %s", recipient_email)
            return
        payload = {
            "from": settings.RESEND_FROM_EMAIL,
            "to": [recipient_email],
            "subject": subject,
            "html": html_body,
            "text": text_body,
        }
        request = urllib.request.Request(
            RESEND_SEND_EMAIL_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as resp:
                resp.read()
        except Exception as exc:
            logger.warning("Due date email failed for %s: %s", recipient_email, exc)
        return

    if settings.EMAIL_HOST or provider in {"smtp", "gmail", "brevo"}:
        smtp_host = _resolve_smtp_host()
        if not smtp_host or not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
            logger.warning("SMTP not configured — skipping due date email to %s", recipient_email)
            return
        from_email = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER
        connection = get_connection(
            backend="django.core.mail.backends.smtp.EmailBackend",
            host=smtp_host,
            port=settings.EMAIL_PORT,
            username=settings.EMAIL_HOST_USER,
            password=settings.EMAIL_HOST_PASSWORD,
            use_tls=settings.EMAIL_USE_TLS,
            use_ssl=settings.EMAIL_USE_SSL,
            timeout=settings.EMAIL_TIMEOUT,
        )
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=from_email,
            to=[recipient_email],
            connection=connection,
        )
        msg.attach_alternative(html_body, "text/html")
        try:
            msg.send(fail_silently=False)
        except Exception as exc:
            logger.warning("Due date email failed for %s: %s", recipient_email, exc)
        return

    logger.warning("Unsupported email provider '%s' — skipping due date email.", provider)

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


class SmsServiceError(Exception):
    pass


def to_e164(phone_number: str) -> str:
    raw = (phone_number or "").strip()
    cleaned = "".join(ch for ch in raw if ch.isdigit() or ch == "+")

    if not cleaned:
        raise SmsServiceError("phone_number is required.")

    if cleaned.startswith("+"):
        digits = "".join(ch for ch in cleaned if ch.isdigit())
        if len(digits) < 10:
            raise SmsServiceError("phone_number must contain at least 10 digits.")
        return f"+{digits}"

    if cleaned.startswith("00"):
        digits = cleaned[2:]
        if len(digits) < 10:
            raise SmsServiceError("phone_number must contain at least 10 digits.")
        return f"+{digits}"

    local_digits = "".join(ch for ch in cleaned if ch.isdigit())
    if len(local_digits) < 10:
        raise SmsServiceError("phone_number must contain at least 10 digits.")

    default_country_code = "".join(ch for ch in settings.SMS_DEFAULT_COUNTRY_CODE if ch.isdigit())
    if not default_country_code:
        raise SmsServiceError("SMS_DEFAULT_COUNTRY_CODE is missing. Use full E.164 format (e.g. +639171234567).")

    if local_digits.startswith("0"):
        local_digits = local_digits[1:]

    return f"+{default_country_code}{local_digits}"


def _build_twilio_client():
    account_sid = settings.TWILIO_ACCOUNT_SID
    auth_token = settings.TWILIO_AUTH_TOKEN
    verify_service_sid = settings.TWILIO_VERIFY_SERVICE_SID

    if not account_sid or not auth_token or not verify_service_sid:
        raise SmsServiceError(
            "Twilio is not fully configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID."
        )

    try:
        from twilio.rest import Client
    except ImportError as exc:
        raise SmsServiceError("Twilio SDK is not installed. Run: pip install -r requirements.txt") from exc

    return Client(account_sid, auth_token), verify_service_sid


def send_sms_verification_code(phone_number: str) -> None:
    if settings.SMS_PROVIDER != "twilio":
        raise SmsServiceError("SMS provider is not enabled. Set SMS_PROVIDER=twilio in backend/.env.")

    to_number = to_e164(phone_number)
    client, verify_service_sid = _build_twilio_client()

    try:
        result = client.verify.v2.services(verify_service_sid).verifications.create(
            to=to_number,
            channel="sms",
        )
    except Exception as exc:
        logger.exception("Twilio verify send failed for %s", to_number)
        raise SmsServiceError("Unable to send verification code. Please try again.") from exc

    if result.status not in {"pending"}:
        raise SmsServiceError("Unable to send verification code right now.")


def verify_sms_code(phone_number: str, code: str) -> bool:
    if settings.SMS_PROVIDER != "twilio":
        raise SmsServiceError("SMS provider is not enabled. Set SMS_PROVIDER=twilio in backend/.env.")

    to_number = to_e164(phone_number)
    client, verify_service_sid = _build_twilio_client()

    try:
        result = client.verify.v2.services(verify_service_sid).verification_checks.create(
            to=to_number,
            code=code,
        )
    except Exception as exc:
        logger.exception("Twilio verify check failed for %s", to_number)
        raise SmsServiceError("Unable to verify code right now. Please try again.") from exc

    return result.status == "approved"

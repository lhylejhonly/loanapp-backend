import base64
import json
import logging
import urllib.error
import urllib.request
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.utils import timezone

from .models import Loan

logger = logging.getLogger(__name__)


class PayoutError(Exception):
    pass


class PayoutConfigurationError(PayoutError):
    pass


class PayoutWebhookValidationError(PayoutError):
    pass


class PayoutStateError(PayoutError):
    pass


def _normalize_gcash_account_number(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit())
    if digits.startswith("63") and len(digits) == 12:
        digits = f"0{digits[2:]}"
    elif digits.startswith("9") and len(digits) == 10:
        digits = f"0{digits}"
    return digits


def _build_reference_id(loan: Loan) -> str:
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
    return f"loan-{loan.pk}-{timestamp}"


def _map_xendit_status(status_value: str) -> str:
    normalized = (status_value or "").strip().upper()
    if normalized in {"ACCEPTED", "REQUESTED"}:
        return Loan.DisbursementStatus.PROCESSING
    if normalized == "SUCCEEDED":
        return Loan.DisbursementStatus.DISBURSED
    if normalized == "REVERSED":
        return Loan.DisbursementStatus.REVERSED
    if normalized in {"FAILED", "CANCELLED"}:
        return Loan.DisbursementStatus.FAILED
    return Loan.DisbursementStatus.PROCESSING


def _build_basic_auth_header(secret_key: str) -> str:
    encoded = base64.b64encode(f"{secret_key}:".encode("utf-8")).decode("ascii")
    return f"Basic {encoded}"


def _request_json(method: str, url: str, *, headers: dict[str, str], payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=body, method=method)
    for key, value in headers.items():
        request.add_header(key, value)

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8") or "{}"
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"error_message": raw or "Unknown payout error"}
        error_message = str(payload.get("error_message") or payload.get("message") or "Payout request failed")
        error_code = str(payload.get("error_code") or exc.code)
        raise PayoutError(f"{error_message} [{error_code}]") from exc
    except urllib.error.URLError as exc:
        raise PayoutError("Unable to reach payout provider. Check network access and provider configuration.") from exc


def uses_automated_payouts(loan: Loan) -> bool:
    return settings.DISBURSEMENT_PROVIDER == Loan.DisbursementProvider.XENDIT and loan.disbursement_method == Loan.DisbursementMethod.GCASH


def _apply_manual_release(loan: Loan, reference: str) -> Loan:
    loan.disbursement_provider = Loan.DisbursementProvider.MANUAL
    loan.disbursement_status = Loan.DisbursementStatus.DISBURSED
    loan.disbursement_reference = reference
    loan.disbursement_external_id = ""
    loan.disbursement_provider_status = "MANUAL_RELEASE"
    loan.disbursement_failure_code = ""
    loan.disbursement_failure_message = ""
    loan.disbursement_requested_at = None
    loan.disbursed_at = timezone.now()
    loan.save(
        update_fields=[
            "disbursement_provider",
            "disbursement_status",
            "disbursement_reference",
            "disbursement_external_id",
            "disbursement_provider_status",
            "disbursement_failure_code",
            "disbursement_failure_message",
            "disbursement_requested_at",
            "disbursed_at",
            "updated_at",
        ]
    )
    return loan


def _apply_xendit_payload(loan: Loan, payload: dict[str, Any], *, requested_at=None) -> Loan:
    provider_status = str(payload.get("status") or "").strip().upper()
    reference_id = str(payload.get("reference_id") or loan.disbursement_reference or "").strip()
    external_id = str(payload.get("id") or loan.disbursement_external_id or "").strip()
    failure_code = str(payload.get("failure_code") or "").strip()
    failure_message = str(payload.get("failure_message") or "").strip()
    mapped_status = _map_xendit_status(provider_status)

    loan.disbursement_provider = Loan.DisbursementProvider.XENDIT
    loan.disbursement_status = mapped_status
    loan.disbursement_reference = reference_id
    loan.disbursement_external_id = external_id
    loan.disbursement_provider_status = provider_status
    loan.disbursement_failure_code = failure_code
    loan.disbursement_failure_message = failure_message
    loan.disbursement_requested_at = requested_at or loan.disbursement_requested_at or timezone.now()
    if mapped_status == Loan.DisbursementStatus.DISBURSED:
        loan.disbursed_at = loan.disbursed_at or timezone.now()
    elif mapped_status in {Loan.DisbursementStatus.FAILED, Loan.DisbursementStatus.REVERSED}:
        if mapped_status == Loan.DisbursementStatus.REVERSED:
            loan.disbursed_at = None
    else:
        loan.disbursed_at = None

    loan.save(
        update_fields=[
            "disbursement_provider",
            "disbursement_status",
            "disbursement_reference",
            "disbursement_external_id",
            "disbursement_provider_status",
            "disbursement_failure_code",
            "disbursement_failure_message",
            "disbursement_requested_at",
            "disbursed_at",
            "updated_at",
        ]
    )
    return loan


def _initiate_xendit_gcash_payout(loan: Loan) -> Loan:
    secret_key = settings.XENDIT_SECRET_KEY
    if not secret_key:
        raise PayoutConfigurationError("Automated payouts are not configured. Add XENDIT_SECRET_KEY in backend/.env.")

    account_number = _normalize_gcash_account_number(loan.disbursement_account_number)
    if len(account_number) != 11 or not account_number.startswith("0"):
        raise PayoutStateError("GCash account number must be 11 digits and start with 0.")

    requested_at = timezone.now()
    reference_id = _build_reference_id(loan)
    request_payload = {
        "reference_id": reference_id,
        "channel_code": settings.XENDIT_GCASH_CHANNEL_CODE,
        "channel_properties": {
            "account_number": account_number,
            "account_holder_name": loan.disbursement_account_name or loan.borrower_name,
        },
        "amount": float(Decimal(loan.amount).quantize(Decimal("0.01"))),
        "description": f"Loan disbursement #{loan.pk}",
        "currency": "PHP",
        "metadata": {
            "loan_id": loan.pk,
            "borrower_id": loan.borrower_id,
            "loan_type": loan.loan_type.name,
            "disbursement_method": loan.disbursement_method,
        },
    }

    response_payload = _request_json(
        "POST",
        f"{settings.XENDIT_API_URL}/v2/payouts",
        headers={
            "Authorization": _build_basic_auth_header(secret_key),
            "Content-Type": "application/json",
            "Idempotency-key": reference_id,
        },
        payload=request_payload,
    )
    return _apply_xendit_payload(loan, response_payload, requested_at=requested_at)


def initiate_loan_disbursement(loan: Loan, disbursement_reference: str = "") -> Loan:
    if loan.status != Loan.Status.APPROVED:
        raise PayoutStateError("Only approved loans can be disbursed.")
    if loan.disbursement_status == Loan.DisbursementStatus.DISBURSED:
        raise PayoutStateError("Loan has already been disbursed.")
    if loan.disbursement_status == Loan.DisbursementStatus.PROCESSING:
        raise PayoutStateError("Loan payout is already being processed.")

    reference = disbursement_reference.strip()
    if uses_automated_payouts(loan):
        return _initiate_xendit_gcash_payout(loan)

    if loan.disbursement_method != Loan.DisbursementMethod.CASH_PICKUP and not reference:
        raise PayoutStateError("disbursement_reference is required for manual bank and e-wallet releases.")

    return _apply_manual_release(loan, reference)


def apply_xendit_payout_webhook(payload: dict[str, Any], callback_token: str | None) -> Loan | None:
    expected_token = settings.XENDIT_WEBHOOK_TOKEN
    if not expected_token:
        raise PayoutConfigurationError("Xendit webhook token is not configured.")
    if (callback_token or "").strip() != expected_token:
        raise PayoutWebhookValidationError("Invalid payout webhook token.")

    event_name = str(payload.get("event") or "").strip().lower()
    if event_name not in {"payout.succeeded", "payout.failed", "payout.reversed"}:
        return None

    data = payload.get("data") or {}
    if not isinstance(data, dict):
        return None

    external_id = str(data.get("id") or "").strip()
    reference_id = str(data.get("reference_id") or "").strip()
    if not external_id and not reference_id:
        return None

    loan = (
        Loan.objects.filter(disbursement_external_id=external_id).first()
        if external_id
        else None
    )
    if loan is None and reference_id:
        loan = Loan.objects.filter(disbursement_reference=reference_id).first()
    if loan is None:
        logger.warning("Received Xendit payout webhook for unknown loan reference %s / %s", external_id, reference_id)
        return None

    return _apply_xendit_payload(loan, data)

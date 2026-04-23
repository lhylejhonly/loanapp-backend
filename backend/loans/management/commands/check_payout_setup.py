from urllib.parse import urljoin

from django.conf import settings
from django.core.management.base import BaseCommand

from loans.models import Loan


class Command(BaseCommand):
    help = "Validate the backend payout configuration for automated borrower disbursements."

    def add_arguments(self, parser):
        parser.add_argument(
            "--base-url",
            dest="base_url",
            default="",
            help="Optional public API base URL used to print the Xendit webhook callback URL.",
        )

    def handle(self, *args, **options):
        provider = (settings.DISBURSEMENT_PROVIDER or "").strip().lower()
        base_url = (options.get("base_url") or "").strip().rstrip("/")
        errors: list[str] = []
        warnings: list[str] = []
        successes: list[str] = []

        if provider == Loan.DisbursementProvider.XENDIT:
            successes.append("DISBURSEMENT_PROVIDER is set to xendit.")

            if settings.XENDIT_SECRET_KEY:
                successes.append("XENDIT_SECRET_KEY is configured.")
            else:
                errors.append("Missing XENDIT_SECRET_KEY.")

            if settings.XENDIT_WEBHOOK_TOKEN:
                successes.append("XENDIT_WEBHOOK_TOKEN is configured.")
            else:
                errors.append("Missing XENDIT_WEBHOOK_TOKEN.")

            if settings.XENDIT_API_URL:
                successes.append(f"XENDIT_API_URL is set to {settings.XENDIT_API_URL}.")
            else:
                errors.append("Missing XENDIT_API_URL.")

            if settings.XENDIT_GCASH_CHANNEL_CODE:
                successes.append(
                    f"XENDIT_GCASH_CHANNEL_CODE is set to {settings.XENDIT_GCASH_CHANNEL_CODE}."
                )
            else:
                errors.append("Missing XENDIT_GCASH_CHANNEL_CODE.")

            if base_url:
                webhook_url = urljoin(f"{base_url}/", "api/webhooks/xendit/payouts/")
                successes.append(f"Configure this webhook URL in Xendit: {webhook_url}")
            else:
                warnings.append(
                    "No --base-url provided, so the public webhook callback URL could not be printed."
                )
        elif provider == Loan.DisbursementProvider.MANUAL:
            warnings.append(
                "DISBURSEMENT_PROVIDER is manual. Loans can be marked as released, but no automated live payout will be sent."
            )
        else:
            errors.append(
                "DISBURSEMENT_PROVIDER must be either 'manual' or 'xendit'."
            )

        warnings.append(
            "This check cannot verify your Xendit account approval, payout balance, or public webhook reachability."
        )
        warnings.append(
            "Automated payouts in this codebase currently support GCash only."
        )

        for message in successes:
            self.stdout.write(self.style.SUCCESS(message))

        for message in warnings:
            self.stdout.write(self.style.WARNING(message))

        for message in errors:
            self.stdout.write(self.style.ERROR(message))

        if errors:
            raise SystemExit(1)

"""
Management command: send_due_date_notifications

Sends in-app notifications to borrowers based on repayment schedule.

Rules:
  7 days before  → "Payment Due in 7 Days"
  3 days before  → "Payment Due in 3 Days"
  1 day before   → "Payment Due Tomorrow"
  On due date    → "Payment Due Today"
  1 day after    → "Payment Overdue"
  7 days after   → "Payment Seriously Overdue"

Run manually:
    python manage.py send_due_date_notifications
    python manage.py send_due_date_notifications --dry-run
"""

import calendar
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

from loans.models import Loan, Notification
from loans.email_verification import send_due_date_notification_email


def _monthly_installment(loan: Loan) -> Decimal:
    total_interest = loan.amount * (loan.interest_rate / Decimal("100"))
    return (loan.amount + total_interest) / loan.term_months


def _next_due_date(loan: Loan) -> date | None:
    """Estimate next due date based on disbursed_at and payments made so far."""
    if not loan.disbursed_at:
        return None

    installment = _monthly_installment(loan)
    if installment <= 0:
        return None

    total_paid = loan.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    paid_count = int(total_paid / installment)

    base = loan.disbursed_at.date()
    month = base.month + paid_count + 1
    year = base.year + (month - 1) // 12
    month = ((month - 1) % 12) + 1
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(base.day, max_day))


def _already_notified_today(borrower, title: str) -> bool:
    """Prevent duplicate notifications on the same day."""
    from django.utils import timezone
    today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return Notification.objects.filter(
        user=borrower,
        title=title,
        created_at__gte=today_start,
    ).exists()


def _send(borrower, title: str, message: str, dry_run: bool) -> bool:
    if dry_run:
        return True
    if _already_notified_today(borrower, title):
        return False
    # 1. Create in-app notification
    Notification.objects.create(
        user=borrower,
        title=title,
        message=message,
        notification_type=Notification.Type.PAYMENT,
    )
    # 2. Send email to borrower
    is_overdue = 'overdue' in title.lower()
    send_due_date_notification_email(
        recipient_email=borrower.email,
        recipient_name=borrower.name,
        title=title,
        message=message,
        is_overdue=is_overdue,
    )
    return True


class Command(BaseCommand):
    help = "Send payment due date reminders and overdue warnings to borrowers."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be sent without saving.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        today = date.today()
        sent = 0
        skipped = 0

        loans = (
            Loan.objects.filter(
                status=Loan.Status.APPROVED,
                disbursement_status=Loan.DisbursementStatus.DISBURSED,
                balance__gt=0,
            )
            .select_related("borrower", "loan_type")
            .prefetch_related("payments")
        )

        RULES = [
            (7,  "Payment Due in 7 Days",
             lambda loan, due, inst: (
                 f"Your {loan.loan_type.name} payment of PHP {inst:,.2f} "
                 f"is due on {due.strftime('%B %d, %Y')}. "
                 "Please prepare your payment to avoid penalties."
             )),
            (3,  "Payment Due in 3 Days",
             lambda loan, due, inst: (
                 f"Reminder: Your {loan.loan_type.name} payment of PHP {inst:,.2f} "
                 f"is due on {due.strftime('%B %d, %Y')}. "
                 "Make sure your GCash account is ready."
             )),
            (1,  "Payment Due Tomorrow",
             lambda loan, due, inst: (
                 f"Your {loan.loan_type.name} payment of PHP {inst:,.2f} "
                 f"is due tomorrow ({due.strftime('%B %d, %Y')}). "
                 "Pay now to avoid late fees."
             )),
            (0,  "Payment Due Today",
             lambda loan, due, inst: (
                 f"Your {loan.loan_type.name} payment of PHP {inst:,.2f} "
                 f"is due TODAY ({due.strftime('%B %d, %Y')}). "
                 "Please pay immediately to avoid penalties."
             )),
            (-1, "Payment Overdue",
             lambda loan, due, inst: (
                 f"Your {loan.loan_type.name} payment of PHP {inst:,.2f} "
                 f"was due yesterday ({due.strftime('%B %d, %Y')}) and has not been recorded. "
                 "Please contact your loan officer immediately."
             )),
            (-7, "Payment Seriously Overdue",
             lambda loan, due, inst: (
                 f"Your {loan.loan_type.name} payment of PHP {inst:,.2f} "
                 f"is now 7 days overdue (due {due.strftime('%B %d, %Y')}). "
                 "Continued non-payment may result in penalties and legal action."
             )),
        ]

        for loan in loans:
            due_date = _next_due_date(loan)
            if not due_date:
                skipped += 1
                continue

            days_diff = (due_date - today).days
            installment = _monthly_installment(loan)
            borrower = loan.borrower

            for trigger_days, title, build_message in RULES:
                if days_diff == trigger_days:
                    message = build_message(loan, due_date, installment)
                    ok = _send(borrower, title, message, dry_run)
                    if ok:
                        if dry_run:
                            self.stdout.write(
                                f"[DRY RUN] {borrower.email} | {title} | "
                                f"Due: {due_date} | Loan #{loan.pk}"
                            )
                        else:
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"✓ '{title}' → {borrower.email} (Loan #{loan.pk})"
                                )
                            )
                        sent += 1
                    else:
                        skipped += 1
                    break
            else:
                skipped += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. {sent} notification(s) sent, {skipped} skipped."
            )
        )

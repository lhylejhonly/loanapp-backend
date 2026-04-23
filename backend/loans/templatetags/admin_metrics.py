from decimal import Decimal

from django import template
from django.db.models import Sum

from loans.models import Loan, Payment, User

register = template.Library()


def _money(value: Decimal | int | float | None) -> str:
    amount = value or Decimal("0")
    return f"PHP {amount:,.2f}"


@register.simple_tag
def admin_metrics() -> dict[str, str | int]:
    loans = Loan.objects.all()
    approved_loans = loans.filter(status=Loan.Status.APPROVED)
    payments = Payment.objects.all()

    total_disbursed = approved_loans.aggregate(total=Sum("amount"))["total"]
    total_collected = payments.aggregate(total=Sum("amount"))["total"]

    return {
        "total_users": User.objects.count(),
        "borrowers": User.objects.filter(role=User.Role.BORROWER).count(),
        "officers": User.objects.filter(role=User.Role.OFFICER).count(),
        "applications": loans.count(),
        "approved_loans": approved_loans.count(),
        "pending_loans": loans.filter(status=Loan.Status.PENDING).count(),
        "total_disbursed": _money(total_disbursed),
        "total_collected": _money(total_collected),
    }

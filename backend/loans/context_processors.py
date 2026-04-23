from decimal import Decimal

from django.db.models import Sum

from .models import Loan, Payment, User


def _money(value) -> str:
    amount = value or Decimal("0")
    return f"PHP {amount:,.2f}"


def admin_dashboard_metrics(request):
    if not request.path.startswith("/admin/"):
        return {}

    try:
        loans = Loan.objects.all()
        approved_loans = loans.filter(status=Loan.Status.APPROVED)
        payments = Payment.objects.all()

        metrics = {
            "total_users": User.objects.count(),
            "borrowers": User.objects.filter(role=User.Role.BORROWER).count(),
            "officers": User.objects.filter(role=User.Role.OFFICER).count(),
            "applications": loans.count(),
            "approved_loans": approved_loans.count(),
            "pending_loans": loans.filter(status=Loan.Status.PENDING).count(),
            "total_disbursed": _money(approved_loans.aggregate(total=Sum("amount"))["total"]),
            "total_collected": _money(payments.aggregate(total=Sum("amount"))["total"]),
        }
    except Exception:
        metrics = {
            "total_users": 0,
            "borrowers": 0,
            "officers": 0,
            "applications": 0,
            "approved_loans": 0,
            "pending_loans": 0,
            "total_disbursed": "PHP 0.00",
            "total_collected": "PHP 0.00",
        }

    return {"admin_metrics": metrics}

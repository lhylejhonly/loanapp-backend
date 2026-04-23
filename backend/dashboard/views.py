from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.views import LoginView, LogoutView
from django.db.models import Sum
from django.shortcuts import redirect
from django.views import View
from django.views.generic import TemplateView

from loans.models import Loan, Payment, User

from .forms import UsernameAuthenticationForm


class RootRedirectView(View):
    def get(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect("dashboard-home")
        return redirect("dashboard-login")


class VuexyLoginView(LoginView):
    authentication_form = UsernameAuthenticationForm
    template_name = "vuexy/auth/login.html"
    redirect_authenticated_user = True
    extra_context = {"page_title": "Loan App Control Center", "show_shell": False}


class VuexyLogoutView(LogoutView):
    next_page = "dashboard-login"


class DashboardHomeView(LoginRequiredMixin, TemplateView):
    template_name = "vuexy/dashboard/home.html"
    login_url = "dashboard-login"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user

        loans = Loan.objects.select_related("loan_type", "borrower")
        payments = Payment.objects.select_related("borrower", "loan")

        if user.role == User.Role.BORROWER:
            loans = loans.filter(borrower=user)
            payments = payments.filter(borrower=user)
            dashboard_title = "Borrower Dashboard"
        elif user.role == User.Role.OFFICER:
            dashboard_title = "Loan Officer Dashboard"
        else:
            dashboard_title = "Admin Dashboard"

        approved_loans = loans.filter(status=Loan.Status.APPROVED)
        total_disbursed = approved_loans.aggregate(total=Sum("amount"))["total"] or 0
        total_outstanding = approved_loans.aggregate(total=Sum("balance"))["total"] or 0
        total_collected = payments.aggregate(total=Sum("amount"))["total"] or 0

        context.update(
            {
                "dashboard_title": dashboard_title,
                "kpis": [
                    {"label": "Total Applications", "value": loans.count()},
                    {"label": "Approved Loans", "value": approved_loans.count()},
                    {"label": "Disbursed Amount", "value": f"PHP {total_disbursed:,.2f}"},
                    {"label": "Outstanding Balance", "value": f"PHP {total_outstanding:,.2f}"},
                    {"label": "Collected Payments", "value": f"PHP {total_collected:,.2f}"},
                ],
                "recent_loans": loans.order_by("-updated_at")[:8],
                "recent_payments": payments.order_by("-date", "-created_at")[:8],
            }
        )
        return context

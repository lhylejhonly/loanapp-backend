from django.urls import path

from .views import DashboardHomeView, RootRedirectView, VuexyLoginView, VuexyLogoutView

urlpatterns = [
    path("", RootRedirectView.as_view(), name="dashboard-root"),
    path("dashboard/login/", VuexyLoginView.as_view(), name="dashboard-login"),
    path("dashboard/logout/", VuexyLogoutView.as_view(), name="dashboard-logout"),
    path("dashboard/", DashboardHomeView.as_view(), name="dashboard-home"),
]

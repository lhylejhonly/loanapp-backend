from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path("", RedirectView.as_view(pattern_name="admin:index", permanent=False)),
    path("dashboard/", RedirectView.as_view(url="/admin/", permanent=False)),
    path("dashboard/login/", RedirectView.as_view(url="/admin/login/", permanent=False)),
    path("dashboard/logout/", RedirectView.as_view(url="/admin/logout/", permanent=False)),
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="api-schema"), name="api-docs"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="api-schema"), name="api-redoc"),
    path("api/", include("loans.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

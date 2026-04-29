import ipaddress
import os
import socket
import sys
from datetime import timedelta
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / "subdir".
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def is_runserver_command() -> bool:
    return len(sys.argv) > 1 and sys.argv[1] == "runserver"


def append_unique(items: list[str], value: str) -> None:
    if value and value not in items:
        items.append(value)


def get_local_private_ipv4_addresses() -> list[str]:
    addresses: set[str] = set()

    try:
        for _, _, _, _, sockaddr in socket.getaddrinfo(
            socket.gethostname(),
            None,
            socket.AF_INET,
        ):
            address = sockaddr[0]
            try:
                parsed = ipaddress.ip_address(address)
            except ValueError:
                continue

            if parsed.is_private and not parsed.is_loopback:
                addresses.add(address)
    except OSError:
        return []

    return sorted(addresses)


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/
DJANGO_ENV = os.getenv("DJANGO_ENV", "development").strip().lower()
if DJANGO_ENV not in {"development", "staging", "production"}:
    raise ImproperlyConfigured("DJANGO_ENV must be one of: development, staging, production.")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-secret-key-change-in-production")
DEBUG = env_bool("DJANGO_DEBUG", DJANGO_ENV == "development")
ALLOW_INSECURE_LOCALHOST = env_bool(
    "DJANGO_ALLOW_INSECURE_LOCALHOST",
    is_runserver_command(),
)
ENABLE_HTTPS_SECURITY = not DEBUG and not ALLOW_INSECURE_LOCALHOST
LOCAL_PRIVATE_IPV4_ADDRESSES = get_local_private_ipv4_addresses() if ALLOW_INSECURE_LOCALHOST else []
allowed_hosts_default = "*" if DEBUG else ""
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", allowed_hosts_default)
render_external_hostname = os.getenv("RENDER_EXTERNAL_HOSTNAME", "").strip()
if render_external_hostname and render_external_hostname not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(render_external_hostname)
if ALLOW_INSECURE_LOCALHOST:
    append_unique(ALLOWED_HOSTS, "127.0.0.1")
    append_unique(ALLOWED_HOSTS, "localhost")
    for address in LOCAL_PRIVATE_IPV4_ADDRESSES:
        append_unique(ALLOWED_HOSTS, address)


# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "drf_spectacular",
    "dashboard",
    "loans",
]

MEDIA_STORAGE_BACKEND = os.getenv("DJANGO_MEDIA_STORAGE", "filesystem").strip().lower() or "filesystem"
if MEDIA_STORAGE_BACKEND not in {"filesystem", "s3"}:
    raise ImproperlyConfigured("DJANGO_MEDIA_STORAGE must be either 'filesystem' or 's3'.")
if MEDIA_STORAGE_BACKEND == "s3":
    INSTALLED_APPS.append("storages")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "loans.context_processors.admin_dashboard_metrics",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

def build_database_config() -> dict[str, object]:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        return dj_database_url.parse(
            database_url,
            conn_max_age=600,
            ssl_require=not DEBUG,
        )

    db_name = os.getenv("DJANGO_DB_NAME", "").strip()
    if not db_name:
        raise ImproperlyConfigured(
            "DATABASE_URL is not set. Define DATABASE_URL for hosted environments or "
            "set DJANGO_DB_NAME, DJANGO_DB_USER, DJANGO_DB_PASSWORD, DJANGO_DB_HOST, "
            "and DJANGO_DB_PORT for local development."
        )

    db_config: dict[str, object] = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": db_name,
        "USER": os.getenv("DJANGO_DB_USER", "").strip(),
        "PASSWORD": os.getenv("DJANGO_DB_PASSWORD", "").strip(),
        "HOST": os.getenv("DJANGO_DB_HOST", "127.0.0.1").strip(),
        "PORT": os.getenv("DJANGO_DB_PORT", "5432").strip(),
        "CONN_MAX_AGE": 600,
    }

    db_options: dict[str, object] = {}
    db_connect_timeout = os.getenv("DJANGO_DB_CONNECT_TIMEOUT", "").strip()
    if db_connect_timeout:
        db_options["connect_timeout"] = int(db_connect_timeout)
    if not DEBUG:
        db_options["sslmode"] = "require"
    if db_options:
        db_config["OPTIONS"] = db_options

    return db_config


DATABASES = {
    "default": build_database_config()
}


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/
LANGUAGE_CODE = os.getenv("DJANGO_LANGUAGE_CODE", "en-us")
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True


# Static and media files
# https://docs.djangoproject.com/en/5.2/howto/static-files/
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

if MEDIA_STORAGE_BACKEND == "s3":
    s3_bucket_name = os.getenv("AWS_STORAGE_BUCKET_NAME", "").strip()
    if not s3_bucket_name:
        raise ImproperlyConfigured("AWS_STORAGE_BUCKET_NAME is required when DJANGO_MEDIA_STORAGE=s3.")

    s3_custom_domain = os.getenv("AWS_S3_CUSTOM_DOMAIN", "").strip()
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": s3_bucket_name,
            "access_key": os.getenv("AWS_ACCESS_KEY_ID", "").strip() or None,
            "secret_key": os.getenv("AWS_SECRET_ACCESS_KEY", "").strip() or None,
            "region_name": os.getenv("AWS_S3_REGION_NAME", "").strip() or None,
            "endpoint_url": os.getenv("AWS_S3_ENDPOINT_URL", "").strip() or None,
            "default_acl": None,
            "querystring_auth": env_bool("AWS_QUERYSTRING_AUTH", False),
        },
    }
    MEDIA_URL = (
        f"https://{s3_custom_domain}/"
        if s3_custom_domain
        else f"https://{s3_bucket_name}.s3.amazonaws.com/"
    )

MAX_UPLOAD_MB = max(int(os.getenv("DJANGO_MAX_UPLOAD_MB", "10")), 1)
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_MB * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = FILE_UPLOAD_MAX_MEMORY_SIZE + (1024 * 1024)


# Security defaults for production
if not DEBUG:
    if SECRET_KEY == "dev-secret-key-change-in-production":
        raise ImproperlyConfigured("Set DJANGO_SECRET_KEY before running with DJANGO_DEBUG=False.")
    if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured("Set DJANGO_ALLOWED_HOSTS to explicit hostnames for production.")
    if all(host in {"127.0.0.1", "localhost"} for host in ALLOWED_HOSTS):
        raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS cannot be local-only when DJANGO_DEBUG=False.")

SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", ENABLE_HTTPS_SECURITY)
SESSION_COOKIE_SECURE = env_bool("DJANGO_SESSION_COOKIE_SECURE", ENABLE_HTTPS_SECURITY)
CSRF_COOKIE_SECURE = env_bool("DJANGO_CSRF_COOKIE_SECURE", ENABLE_HTTPS_SECURITY)
USE_X_FORWARDED_HOST = env_bool("DJANGO_USE_X_FORWARDED_HOST", ENABLE_HTTPS_SECURITY)

if ENABLE_HTTPS_SECURITY:
    SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", True)
    SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", True)
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
else:
    SECURE_HSTS_SECONDS = 0
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SECURE_HSTS_PRELOAD = False

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = os.getenv("DJANGO_SESSION_COOKIE_SAMESITE", "Lax").strip() or "Lax"
CSRF_COOKIE_SAMESITE = os.getenv("DJANGO_CSRF_COOKIE_SAMESITE", "Lax").strip() or "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = os.getenv("DJANGO_SECURE_REFERRER_POLICY", "same-origin").strip() or "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = (
    os.getenv("DJANGO_SECURE_CROSS_ORIGIN_OPENER_POLICY", "same-origin").strip() or "same-origin"
)
X_FRAME_OPTIONS = os.getenv("DJANGO_X_FRAME_OPTIONS", "DENY").strip() or "DENY"


# CORS / CSRF
CORS_ALLOW_ALL_ORIGINS = DEBUG and env_bool("DJANGO_CORS_ALLOW_ALL_DEBUG", True)
cors_allowed_origins_default = (
    "http://127.0.0.1:19006,http://localhost:19006,http://127.0.0.1:8081,http://localhost:8081,http://127.0.0.1:8000,http://localhost:8000,http://172.20.10.2:19006,http://172.20.10.2:8081,http://172.20.10.2:8000"
    if DEBUG
    else ""
)
CORS_ALLOWED_ORIGINS = env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    cors_allowed_origins_default,
)
if ALLOW_INSECURE_LOCALHOST:
    for address in LOCAL_PRIVATE_IPV4_ADDRESSES:
        append_unique(CORS_ALLOWED_ORIGINS, f"http://{address}:19006")
        append_unique(CORS_ALLOWED_ORIGINS, f"http://{address}:8081")
        append_unique(CORS_ALLOWED_ORIGINS, f"http://{address}:8000")
CORS_ALLOW_CREDENTIALS = True

csrf_trusted_origins_default = "http://127.0.0.1:8000,http://localhost:8000,http://172.20.10.2:8000" if DEBUG else ""
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    csrf_trusted_origins_default,
)
if ALLOW_INSECURE_LOCALHOST:
    for address in LOCAL_PRIVATE_IPV4_ADDRESSES:
        append_unique(CSRF_TRUSTED_ORIGINS, f"http://{address}:8000")


# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "loans.User"
LOGIN_URL = "/admin/login/"
LOGIN_REDIRECT_URL = "/admin/"
LOGOUT_REDIRECT_URL = "/admin/login/"


# API / auth settings
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": int(os.getenv("DJANGO_API_PAGE_SIZE", "25")),
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("DJANGO_THROTTLE_ANON", "60/minute"),
        "user": os.getenv("DJANGO_THROTTLE_USER", "300/minute"),
        "login": os.getenv("DJANGO_THROTTLE_LOGIN", "10/minute"),
        "register": os.getenv("DJANGO_THROTTLE_REGISTER", "5/minute"),
        "verification_send": os.getenv("DJANGO_THROTTLE_VERIFICATION_SEND", "5/minute"),
        "verification_verify": os.getenv("DJANGO_THROTTLE_VERIFICATION_VERIFY", "10/minute"),
        "forgot_password": os.getenv("DJANGO_THROTTLE_FORGOT_PASSWORD", "5/minute"),
        "reset_password": os.getenv("DJANGO_THROTTLE_RESET_PASSWORD", "10/minute"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=int(os.getenv("DJANGO_ACCESS_TOKEN_HOURS", "24"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("DJANGO_REFRESH_TOKEN_DAYS", "7"))),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Loan App API",
    "DESCRIPTION": "API for the Loan App platform.",
    "VERSION": "1.0.0",
}

# Email verification
EMAIL_VERIFICATION_PROVIDER = os.getenv("EMAIL_VERIFICATION_PROVIDER", "console").strip().lower()
EMAIL_VERIFICATION_CODE_LENGTH = int(os.getenv("EMAIL_VERIFICATION_CODE_LENGTH", "6"))
EMAIL_VERIFICATION_TTL_MINUTES = int(os.getenv("EMAIL_VERIFICATION_TTL_MINUTES", "10"))
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = int(
    os.getenv("EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS", "60")
)
EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR = int(os.getenv("EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR", "5"))
EMAIL_VERIFICATION_MAX_VERIFY_ATTEMPTS = int(os.getenv("EMAIL_VERIFICATION_MAX_VERIFY_ATTEMPTS", "5"))
EMAIL_VERIFICATION_LOCKOUT_MINUTES = int(os.getenv("EMAIL_VERIFICATION_LOCKOUT_MINUTES", "15"))
EMAIL_VERIFICATION_SUBJECT = os.getenv(
    "EMAIL_VERIFICATION_SUBJECT",
    "Your ElevateFunds verification code",
).strip()
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "").strip()
EMAIL_HOST = os.getenv(
    "EMAIL_HOST",
    "smtp.gmail.com" if EMAIL_VERIFICATION_PROVIDER == "gmail" else "",
).strip()
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "").strip()
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "").strip()
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", EMAIL_VERIFICATION_PROVIDER == "gmail")
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", False)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER).strip()
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT", "15"))

# SMS verification
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "disabled").strip().lower() or "disabled"
SMS_DEFAULT_COUNTRY_CODE = os.getenv("SMS_DEFAULT_COUNTRY_CODE", "+63").strip() or "+63"
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_VERIFY_SERVICE_SID = os.getenv("TWILIO_VERIFY_SERVICE_SID", "").strip()


# Provider-backed loan disbursements
DISBURSEMENT_PROVIDER = os.getenv("DISBURSEMENT_PROVIDER", "manual").strip().lower()
XENDIT_API_URL = os.getenv("XENDIT_API_URL", "https://api.xendit.co").strip().rstrip("/")
XENDIT_SECRET_KEY = os.getenv("XENDIT_SECRET_KEY", "").strip()
XENDIT_WEBHOOK_TOKEN = os.getenv("XENDIT_WEBHOOK_TOKEN", "").strip()
XENDIT_GCASH_CHANNEL_CODE = os.getenv("XENDIT_GCASH_CHANNEL_CODE", "PH_GCASH").strip()


# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        }
    },
    "root": {
        "handlers": ["console"],
        "level": os.getenv("DJANGO_LOG_LEVEL", "INFO"),
    },
}

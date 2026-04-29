# Loan Management Backend (Django + DRF)

Production-oriented Django backend with:
- JWT auth APIs for borrower/officer/admin roles
- Unified admin + operational dashboard at `/admin/`
- DRF schema/docs
- environment-driven settings
- CORS + static/media setup

## 1) Install

```bash
cd backend
python -m pip install -r requirements.txt
```

This backend is PostgreSQL-only.

## 2) Configure Environment

```bash
copy .env.example .env
```

Edit `.env` and set your PostgreSQL connection values:

```env
DJANGO_DB_NAME=loan_app
DJANGO_DB_USER=postgres
DJANGO_DB_PASSWORD=postgres
DJANGO_DB_HOST=127.0.0.1
DJANGO_DB_PORT=5433
DJANGO_DB_CONNECT_TIMEOUT=5
```

## 3) Migrate + Seed Demo Data

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py seed_demo --reset
```

## 4) Run Server

```bash
python manage.py runserver
```

If you want one command that starts the bundled local PostgreSQL database and then launches Django, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_backend.ps1
```

## Admin URL

- Unified admin + dashboard: `http://127.0.0.1:8000/admin/`
- Root `/` redirects to `/admin/`
- Legacy `/dashboard/` routes also redirect to `/admin/`

Demo users (from `seed_demo`):
- admin: username `admin`, email `admin@loanapp.com`, password `admin123`
- officer: username `officer`, email `officer@loanapp.com`, password `officer123`
- borrower: username `borrower`, email `borrower@loanapp.com`, password `borrower123`

## API Docs and Health

- OpenAPI schema: `GET /api/schema/`
- Swagger UI: `GET /api/docs/`
- ReDoc: `GET /api/redoc/`
- Health check: `GET /api/health/`

## Auth Endpoints

- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `POST /api/auth/refresh/`
- `GET /api/auth/me/`
- `POST /api/auth/verification/send/`
- `POST /api/auth/verification/verify/`

Use `Authorization: Bearer <access_token>` for protected routes.

### Email Verification

To enable real email verification codes, set in `backend/.env`:

- Gmail SMTP:
  - `EMAIL_VERIFICATION_PROVIDER=gmail`
  - `EMAIL_HOST=smtp.gmail.com`
  - `EMAIL_PORT=587`
  - `EMAIL_HOST_USER=<your_gmail@gmail.com>`
  - `EMAIL_HOST_PASSWORD=<your_gmail_app_password>`
  - `EMAIL_USE_TLS=True`
  - `DEFAULT_FROM_EMAIL=<your_gmail@gmail.com>`

- Generic SMTP:
  - `EMAIL_VERIFICATION_PROVIDER=smtp`
  - `EMAIL_HOST=<your_smtp_host>`
  - `EMAIL_PORT=<your_smtp_port>`
  - `EMAIL_HOST_USER=<your_smtp_username>`
  - `EMAIL_HOST_PASSWORD=<your_smtp_password>`
  - `EMAIL_USE_TLS=True`
  - `DEFAULT_FROM_EMAIL=<your_sender_email>`

- Brevo SMTP:
  - `EMAIL_VERIFICATION_PROVIDER=brevo`
  - `EMAIL_HOST=smtp-relay.brevo.com`
  - `EMAIL_PORT=587`
  - `EMAIL_HOST_USER=<your_brevo_smtp_login>`
  - `EMAIL_HOST_PASSWORD=<your_brevo_smtp_key>`
  - `EMAIL_USE_TLS=True`
  - `DEFAULT_FROM_EMAIL=<your_verified_sender_email>`

- `EMAIL_VERIFICATION_PROVIDER=resend`
- `EMAIL_VERIFICATION_CODE_LENGTH=6`
- `EMAIL_VERIFICATION_TTL_MINUTES=10`
- `EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=60`
- `EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR=5`
- `EMAIL_VERIFICATION_MAX_VERIFY_ATTEMPTS=5`
- `EMAIL_VERIFICATION_LOCKOUT_MINUTES=15`
- `RESEND_API_KEY=<your_resend_api_key>`
- `RESEND_FROM_EMAIL=<your_verified_sender@yourdomain.com>`

For local development without a provider, keep `EMAIL_VERIFICATION_PROVIDER=console`.
The backend will log the verification code instead of sending a real email.
For Gmail, use an App Password rather than your normal account password.

### Real Borrower Payouts

The codebase already supports automated GCash loan disbursements through Xendit.

Set these values in `backend/.env`:

```env
DISBURSEMENT_PROVIDER=xendit
XENDIT_API_URL=https://api.xendit.co
XENDIT_SECRET_KEY=<your_live_or_test_xendit_secret_key>
XENDIT_WEBHOOK_TOKEN=<your_xendit_webhook_token>
XENDIT_GCASH_CHANNEL_CODE=PH_GCASH
```

Then verify the backend setup:

```bash
python manage.py check_payout_setup --base-url https://your-public-api-domain
```

Use this webhook URL in your Xendit dashboard:

- `https://your-public-api-domain/api/webhooks/xendit/payouts/`

Operational flow:

1. Borrower saves a valid GCash name and number.
2. Borrower submits documents and loan application.
3. Officer approves the loan.
4. Officer opens the release action in the app.
5. Backend sends `POST /v2/payouts` to Xendit.
6. Xendit calls the webhook and the loan moves to `processing`, `disbursed`, `failed`, or `reversed`.

Important limits:

- The backend cannot send real money unless your Xendit account is approved for payouts.
- Your Xendit balance must have enough funds.
- Your webhook URL must be publicly reachable over HTTPS.
- The current automated payout path is GCash-only.

## Core API Endpoints

Public:
- `GET /api/public/loan-types/`
- `GET /api/public/overview/`

Borrower:
- `GET /api/borrower/dashboard/`
- `GET,POST /api/borrower/loans/`
- `GET /api/borrower/payments/`
- `GET,POST /api/borrower/documents/`
- `GET /api/borrower/notifications/`
- `POST /api/borrower/notifications/<id>/read/`

Loan Officer:
- `GET /api/officer/applications/`
- `POST /api/officer/applications/<id>/decision/`
- `GET /api/officer/borrowers/`
- `POST /api/officer/borrowers/<id>/toggle-active/`
- `GET /api/officer/approved-loans/`
- `GET /api/officer/payments/`
- `POST /api/officer/payments/record/`

Admin:
- `GET /api/admin/dashboard/`
- `GET /api/admin/reports/`
- `GET /api/admin/transactions/`
- `GET /api/admin/loans/`
- `GET /api/admin/users/`
- `PATCH /api/admin/users/<id>/`
- `GET,POST /api/admin/loan-types/`
- `GET,PATCH,DELETE /api/admin/loan-types/<id>/`

## Admin Theming

Custom admin theme files:
- templates: `templates/admin/`
- styles: `static/admin/css/custom_admin.css`
"# loanapp" 
"# loanapp-backend" 
"# loanapp-backend" 

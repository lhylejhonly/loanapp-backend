# Production Checklist

This checklist reflects the current ElevateFunds codebase and separates what is already scaffolded in code from what still needs external setup.

## 1. Configuration

- [x] Add environment examples for frontend and backend.
- [x] Add explicit `DJANGO_ENV` support.
- [x] Add production validation for secret key and allowed hosts.
- [x] Add upload size limits.
- [ ] Create real staging and production `.env` files with live values.
- [ ] Set `DJANGO_DEBUG=False` in staging and production.
- [ ] Set real `DJANGO_ALLOWED_HOSTS` values for your API domain.

## 2. API Security

- [x] Add global DRF throttling for anonymous and authenticated traffic.
- [x] Add scoped throttling for register, login, verification, forgot-password, and reset-password.
- [x] Add stricter cookie and browser security headers.
- [ ] Rotate a strong production `DJANGO_SECRET_KEY`.
- [ ] Put the backend behind HTTPS with a reverse proxy.
- [ ] Run `python manage.py check --deploy` on the real deployment target.

## 3. File Storage

- [x] Keep filesystem storage for local development.
- [x] Add optional S3-compatible media storage configuration.
- [ ] Provision a real object storage bucket.
- [ ] Add real bucket credentials or IAM-based access in production.
- [ ] Migrate existing local uploaded files if you switch to object storage.

## 4. Mobile Release Pipeline

- [x] Add `frontend/eas.json` for development, preview, and production builds.
- [x] Add a frontend `typecheck` script.
- [ ] Log in to Expo/EAS with your real account.
- [ ] Configure EAS secrets and production env vars.
- [ ] Create signed Android and iOS release builds.
- [ ] Submit store-ready builds with store metadata and privacy disclosures.

## 5. Continuous Integration

- [x] Add frontend CI workflow for type checking.
- [x] Add backend CI workflow for Django checks and smoke tests.
- [ ] Connect the workflows to the actual git repositories you use.
- [ ] Make sure the backend repo contains the vendored PostgreSQL tooling or replace it with a hosted database in CI.

## 6. Messaging

- [x] Add missing SMS/Twilio settings to Django config.
- [ ] Configure real email provider credentials.
- [ ] Configure Twilio only if you will use SMS verification.
- [ ] Add push notifications if you want real-time mobile alerts.

## 7. Payments and Disbursements

- [x] Keep manual disbursement mode available.
- [x] Keep Xendit payout env scaffolding available.
- [ ] Configure real Xendit credentials and webhook URL.
- [ ] Test payout reconciliation and failure handling on staging.
- [ ] Define an operator runbook for failed payouts, reversals, and repayment disputes.

## 8. Monitoring and Operations

- [ ] Add backend error monitoring.
- [ ] Add mobile crash reporting.
- [ ] Add uptime monitoring for the API and webhook endpoints.
- [ ] Add database backup and restore drills.
- [ ] Add audit logging for officer and admin actions.

## 9. Legal and Compliance

- [ ] Finalize Privacy Policy text.
- [ ] Finalize Terms and Conditions text.
- [ ] Confirm lending, disclosure, and privacy requirements for your jurisdiction.
- [ ] Define data retention and account deletion policy.

## 10. Launch Readiness

- [ ] Staging environment tested end-to-end on real devices.
- [ ] Production environment tested end-to-end on real devices.
- [ ] Loan officer workflow tested with real document review.
- [ ] Borrower repayment request workflow tested with real operators.
- [ ] Incident response and rollback plan documented.

## Notes

- The repo-side changes are applied.
- External accounts, hosting, domains, store submissions, legal approval, and live provider credentials still require your input.

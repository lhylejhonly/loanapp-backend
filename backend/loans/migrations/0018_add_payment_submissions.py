from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("loans", "0017_add_document_rejection_reason_and_rejected_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="PaymentSubmission",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "amount",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=12,
                        validators=[MinValueValidator(Decimal("0.01"))],
                    ),
                ),
                (
                    "payment_method",
                    models.CharField(
                        choices=[
                            ("cash", "Cash"),
                            ("bank_transfer", "Bank Transfer"),
                            ("gcash", "GCash"),
                            ("maya", "Maya"),
                        ],
                        default="cash",
                        max_length=20,
                    ),
                ),
                ("payment_reference", models.CharField(blank=True, max_length=120)),
                ("note", models.CharField(blank=True, max_length=255)),
                ("proof_file_name", models.CharField(blank=True, max_length=255)),
                ("proof_file", models.FileField(blank=True, null=True, upload_to="payment_submissions/")),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("rejection_reason", models.TextField(blank=True, default="")),
                ("submitted_at", models.DateTimeField(auto_now_add=True)),
                (
                    "approved_payment",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="source_submission",
                        to="loans.payment",
                    ),
                ),
                (
                    "borrower",
                    models.ForeignKey(
                        limit_choices_to={"role": "borrower"},
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payment_submissions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "loan",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payment_submissions",
                        to="loans.loan",
                    ),
                ),
                (
                    "reviewed_by",
                    models.ForeignKey(
                        blank=True,
                        limit_choices_to={"role__in": ["officer", "admin"]},
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="reviewed_payment_submissions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-submitted_at", "-pk"],
            },
        ),
    ]

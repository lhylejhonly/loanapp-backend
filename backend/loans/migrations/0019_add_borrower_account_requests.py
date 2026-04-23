from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("loans", "0018_add_payment_submissions"),
    ]

    operations = [
        migrations.CreateModel(
            name="BorrowerAccountRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "request_type",
                    models.CharField(
                        choices=[
                            ("data_export", "Data Export"),
                            ("account_deletion", "Account Deletion"),
                        ],
                        max_length=30,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("in_progress", "In Progress"),
                            ("completed", "Completed"),
                            ("rejected", "Rejected"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("note", models.TextField(blank=True, default="")),
                ("admin_note", models.TextField(blank=True, default="")),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "borrower",
                    models.ForeignKey(
                        limit_choices_to={"role": "borrower"},
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="account_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "resolved_by",
                    models.ForeignKey(
                        blank=True,
                        limit_choices_to={"role__in": ["officer", "admin"]},
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="resolved_account_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-pk"],
            },
        ),
    ]

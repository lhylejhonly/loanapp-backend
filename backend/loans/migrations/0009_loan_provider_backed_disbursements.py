from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("loans", "0008_add_disbursement_and_payment_tracking"),
    ]

    operations = [
        migrations.AlterField(
            model_name="loan",
            name="disbursement_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("processing", "Processing"),
                    ("disbursed", "Disbursed"),
                    ("failed", "Failed"),
                    ("reversed", "Reversed"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="loan",
            name="disbursement_external_id",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="loan",
            name="disbursement_failure_code",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="loan",
            name="disbursement_failure_message",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="loan",
            name="disbursement_provider",
            field=models.CharField(
                choices=[("manual", "Manual"), ("xendit", "Xendit")],
                default="manual",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="loan",
            name="disbursement_provider_status",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="loan",
            name="disbursement_requested_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

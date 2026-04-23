from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("loans", "0009_loan_provider_backed_disbursements"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="gcash_account_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="user",
            name="gcash_account_number",
            field=models.CharField(blank=True, max_length=30),
        ),
    ]

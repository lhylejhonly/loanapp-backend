import re

from django.db import migrations, models


def _normalize_username(raw_value: str) -> str:
    value = (raw_value or "").strip().lower()
    value = re.sub(r"[^a-z0-9_.-]+", "", value)
    return value[:30] or "user"


def populate_usernames(apps, schema_editor):
    User = apps.get_model("loans", "User")
    alias = schema_editor.connection.alias
    assigned = set()

    for user in User.objects.using(alias).all().order_by("id"):
        base = _normalize_username((user.email or "").split("@")[0] or user.name or f"user{user.pk}")
        candidate = base
        counter = 1

        while candidate in assigned or User.objects.using(alias).filter(username=candidate).exclude(pk=user.pk).exists():
            suffix = f"-{counter}"
            candidate = f"{base[: max(1, 30 - len(suffix))]}{suffix}"
            counter += 1

        user.username = candidate
        user.save(update_fields=["username"])
        assigned.add(candidate)


class Migration(migrations.Migration):

    dependencies = [
        ("loans", "0003_user_email_verification_code_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="username",
            field=models.CharField(blank=True, max_length=150, null=True, unique=True),
        ),
        migrations.RunPython(populate_usernames, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="username",
            field=models.CharField(max_length=150, unique=True),
        ),
    ]

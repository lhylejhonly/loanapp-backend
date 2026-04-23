from django.db import migrations
from decimal import Decimal


STUDENT_DOCS = ["government_id", "student_id"]
BUSINESS_DOCS = ["business_permit", "business_owner_id", "proof_of_revenue"]


def enforce_loan_limits(apps, schema_editor):
    LoanType = apps.get_model("loans", "LoanType")

    for lt in LoanType.objects.all():
        name = lt.name.lower()
        changed = False

        if "student" in name or "education" in name or "school" in name:
            if lt.max_amount > Decimal("5000.00"):
                lt.max_amount = Decimal("5000.00")
                changed = True
            if lt.min_amount > Decimal("5000.00"):
                lt.min_amount = Decimal("500.00")
                changed = True
            if lt.required_documents != STUDENT_DOCS:
                lt.required_documents = STUDENT_DOCS
                changed = True

        elif "business" in name or "entrepreneur" in name or "micro" in name or "sme" in name:
            if lt.max_amount > Decimal("100000.00"):
                lt.max_amount = Decimal("100000.00")
                changed = True
            if lt.required_documents != BUSINESS_DOCS:
                lt.required_documents = BUSINESS_DOCS
                changed = True

        if changed:
            lt.save()


class Migration(migrations.Migration):

    dependencies = [
        ("loans", "0012_add_document_types"),
    ]

    operations = [
        migrations.RunPython(enforce_loan_limits, migrations.RunPython.noop),
    ]

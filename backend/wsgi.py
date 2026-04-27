"""Compatibility WSGI entrypoint for hosts using `backend.wsgi:application`."""

import os
import sys
from pathlib import Path

from django.core.wsgi import get_wsgi_application


BACKEND_DIR = Path(__file__).resolve().parent
backend_dir_str = str(BACKEND_DIR)
if backend_dir_str not in sys.path:
    # Expose config/, dashboard/, and loans/ as top-level modules.
    sys.path.insert(0, backend_dir_str)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()

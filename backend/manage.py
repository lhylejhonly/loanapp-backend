#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import socket
import subprocess
import sys
from pathlib import Path


LOCAL_DB_COMMANDS = {
    "runserver",
    "migrate",
    "createsuperuser",
    "seed_demo",
    "test",
}


def _read_env_file(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.exists():
        return values

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")

    return values


def _db_target(base_dir: Path) -> tuple[str, str]:
    env_values = _read_env_file(base_dir / ".env")
    host = os.getenv("DJANGO_DB_HOST") or env_values.get("DJANGO_DB_HOST", "127.0.0.1")
    port = os.getenv("DJANGO_DB_PORT") or env_values.get("DJANGO_DB_PORT", "5433")
    return host.strip(), port.strip()


def _port_is_open(host: str, port: str) -> bool:
    try:
        with socket.create_connection((host, int(port)), timeout=1):
            return True
    except (OSError, ValueError):
        return False


def _maybe_start_local_postgres() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command not in LOCAL_DB_COMMANDS or os.name != "nt":
        return

    base_dir = Path(__file__).resolve().parent
    host, port = _db_target(base_dir)
    if host not in {"127.0.0.1", "localhost", "::1"} or _port_is_open(host, port):
        return

    script_path = base_dir / "scripts" / "start_local_postgres.ps1"
    if not script_path.exists():
        return

    try:
        result = subprocess.run(
            ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", str(script_path)],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            "Timed out while starting the bundled PostgreSQL server. "
            "Run scripts/start_local_postgres.ps1 manually and check vendor/postgres.stderr.log."
        ) from exc
    except OSError as exc:
        raise RuntimeError(
            "Unable to launch PowerShell to start the bundled PostgreSQL server automatically."
        ) from exc

    if result.returncode != 0:
        details = (result.stderr or result.stdout).strip()
        raise RuntimeError(
            "Unable to start the bundled PostgreSQL server automatically. "
            f"{details or 'Run scripts/start_local_postgres.ps1 manually.'}"
        )

    if result.stdout.strip():
        print(result.stdout.strip())


def main():
    """Run administrative tasks."""
    _maybe_start_local_postgres()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()

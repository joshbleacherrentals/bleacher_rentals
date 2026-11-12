"""Environment the Python API needs. Read lazily so tests and imports never need it."""

import os


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing environment variable {name}.")
    return value


def supabase_url() -> str:
    return _require("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")


def supabase_service_key() -> str:
    return _require("SUPABASE_SERVICE_ROLE_KEY")

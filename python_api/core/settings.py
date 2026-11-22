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


def google_maps_key() -> str | None:
    """The Google Maps key for server calls: GOOGLE_MAPS_SERVER_KEY, else the app's own key (the
    Next.js server already calls Google with it). None when neither is set: callers then estimate."""
    return os.environ.get("GOOGLE_MAPS_SERVER_KEY") or os.environ.get("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY") or None

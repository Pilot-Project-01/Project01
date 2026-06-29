"""Single Supabase client, created with the sb_secret_ (service-role) key.

This key bypasses RLS, so it must only ever be used here in trusted server code.
The frontend never holds it and never talks to Supabase directly in v1.
"""

from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    if not settings.supabase_configured:
        raise RuntimeError(
            "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY "
            "in backend/.env."
        )
    return create_client(settings.supabase_url, settings.supabase_secret_key)

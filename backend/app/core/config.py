"""Runtime configuration, loaded from the environment.

Secrets live in backend/.env (never committed). Only the sb_secret_ key is used
to talk to Supabase — it stays server-side per the project conventions.
"""

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Repo root is two levels up from this file: backend/app/core/config.py -> repo/
REPO_ROOT = Path(__file__).resolve().parents[3]
TASKS_DIR = REPO_ROOT / "tasks"


class Settings:
    """Plain settings holder. Read once at import; fail loud if misconfigured."""

    supabase_url: str
    supabase_secret_key: str
    admin_api_token: str

    def __init__(self) -> None:
        self.supabase_url = os.getenv("SUPABASE_URL", "")
        self.supabase_secret_key = os.getenv("SUPABASE_SECRET_KEY", "")
        # Secret guarding the admin read endpoints (sessions list + trace export).
        self.admin_api_token = os.getenv("ADMIN_API_TOKEN", "")

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_secret_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()

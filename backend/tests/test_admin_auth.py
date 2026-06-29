"""The admin read endpoints must be closed; the candidate writes must stay open."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.services import trace_store
from main import app

client = TestClient(app)
TOKEN = "test-admin-token"


@pytest.fixture(autouse=True)
def configured_token(monkeypatch):
    """Point the settings at a known admin token for the duration of a test."""
    get_settings.cache_clear()
    monkeypatch.setenv("ADMIN_API_TOKEN", TOKEN)
    yield
    get_settings.cache_clear()


def test_list_sessions_requires_token():
    assert client.get("/api/v1/sessions").status_code == 401


def test_trace_requires_token():
    assert client.get("/api/v1/sessions/whatever/trace").status_code == 401


def test_wrong_token_rejected():
    resp = client.get("/api/v1/sessions", headers={"Authorization": "Bearer nope"})
    assert resp.status_code == 401


def test_valid_token_passes_auth(monkeypatch):
    # Stub the data layer so we test only the auth boundary, not Supabase.
    monkeypatch.setattr(trace_store, "list_sessions", lambda: [])
    resp = client.get("/api/v1/sessions", headers={"Authorization": f"Bearer {TOKEN}"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_unconfigured_token_fails_closed(monkeypatch):
    # No token set anywhere → deny (503), never serve data open.
    get_settings.cache_clear()
    monkeypatch.delenv("ADMIN_API_TOKEN", raising=False)
    resp = client.get("/api/v1/sessions", headers={"Authorization": "Bearer anything"})
    assert resp.status_code == 503
    get_settings.cache_clear()


def test_candidate_writes_stay_public(monkeypatch):
    # Creating a session needs no admin token (candidates have none).
    monkeypatch.setattr(trace_store, "create_session", lambda body: "sess-123")
    resp = client.post(
        "/api/v1/sessions",
        json={"task_id": "v1-cart-discount", "candidate_name": "Ada"},
    )
    assert resp.status_code == 201
    assert resp.json() == {"session_id": "sess-123"}

"""Shared in-memory fake Supabase, so service tests need no real database."""

import uuid
from datetime import datetime, timezone

import pytest


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._op = None
        self._payload = None
        self._on_conflict = None
        self._filters = []
        self._order = None

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def upsert(self, payload, on_conflict=None):
        self._op, self._payload, self._on_conflict = "upsert", payload, on_conflict
        return self

    def update(self, payload):
        self._op, self._payload = "update", payload
        return self

    def select(self, *_):
        self._op = "select"
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def _match(self, row):
        return all(row.get(c) == v for c, v in self._filters)

    def execute(self):
        rows = self._store[self._table]
        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = [self._with_defaults(i) for i in items]
            rows.extend(inserted)
            return _Result(inserted)
        if self._op == "upsert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            keys = [k.strip() for k in (self._on_conflict or "").split(",") if k.strip()]
            for item in items:
                existing = next(
                    (r for r in rows if all(r.get(k) == item.get(k) for k in keys)), None
                ) if keys else None
                if existing:
                    existing.update(item)
                else:
                    rows.append(self._with_defaults(item))
            return _Result([])
        if self._op == "update":
            for r in rows:
                if self._match(r):
                    r.update(self._payload)
            return _Result([])
        out = [r for r in rows if self._match(r)]
        if self._order:
            col, desc = self._order
            out = sorted(out, key=lambda r: r.get(col), reverse=desc)
        return _Result(out)

    def _with_defaults(self, item):
        row = dict(item)
        row.setdefault("id", str(uuid.uuid4()))
        now = datetime.now(timezone.utc).isoformat()
        row.setdefault("created_at", now)
        row.setdefault("updated_at", now)
        if self._table == "sessions":
            row.setdefault("started_at", None)
            row.setdefault("ended_at", None)
            row.setdefault("marked_ready", False)
            row.setdefault("final_files", None)
        return row


class FakeSupabase:
    def __init__(self):
        self._store = {"sessions": [], "trace_events": []}

    def table(self, name):
        return _Query(self._store, name)


@pytest.fixture
def store(monkeypatch):
    """Patch the data layer with an in-memory fake; return the trace_store module."""
    from app.services import trace_store

    fake = FakeSupabase()
    monkeypatch.setattr(trace_store, "get_supabase", lambda: fake)
    return trace_store

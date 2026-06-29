"""Round-trip the trace store against an in-memory fake Supabase.

This exercises the real create -> ingest -> export logic (seq ordering, side-effect
projection onto the session row, diff reconstruction) without needing a database.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.events import EventType
from app.models.trace import EventBatch, SessionCreate, TraceEventIn


# ---- in-memory fake Supabase ----------------------------------------------

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
                    (r for r in rows if all(r.get(k) == item.get(k) for k in keys)),
                    None,
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
        # select
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


class _FakeSupabase:
    def __init__(self):
        self._store = {"sessions": [], "trace_events": []}

    def table(self, name):
        return _Query(self._store, name)


@pytest.fixture
def store(monkeypatch):
    from app.services import trace_store

    fake = _FakeSupabase()
    monkeypatch.setattr(trace_store, "get_supabase", lambda: fake)
    return trace_store


# ---- tests -----------------------------------------------------------------

def _ts(base, secs):
    return base + timedelta(seconds=secs)


def test_full_round_trip(store):
    base = datetime(2026, 6, 22, 12, 0, 0, tzinfo=timezone.utc)

    sid = store.create_session(
        SessionCreate(task_id="v1-cart-discount", candidate_name="Ada L")
    )

    events = [
        TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.ASSESSMENT_STARTED),
        TraceEventIn(
            seq=2, client_ts=_ts(base, 2), type=EventType.AGENT_NOTE_VIEWED,
            payload={"dwell_ms": 4000},
        ),
        TraceEventIn(
            seq=3, client_ts=_ts(base, 3), type=EventType.FILE_OPENED,
            payload={"path": "src/cart.ts"},
        ),
        TraceEventIn(
            seq=4, client_ts=_ts(base, 4), type=EventType.FILE_EDITED,
            payload={"path": "src/cart.ts", "content": "line a\nline b\n"},
        ),
        TraceEventIn(
            seq=5, client_ts=_ts(base, 5), type=EventType.FILE_EDITED,
            payload={"path": "src/cart.ts", "content": "line a\nline B changed\n"},
        ),
        TraceEventIn(
            seq=6, client_ts=_ts(base, 6), type=EventType.TEST_RUN,
            payload={"result": {"passed": 1, "failed": 0}},
        ),
        TraceEventIn(
            seq=7, client_ts=_ts(base, 7), type=EventType.MARKED_READY,
            payload={"files": {"src/cart.ts": "line a\nline B changed\n"}},
        ),
    ]
    ingested = store.ingest_events(sid, EventBatch(events=events))
    assert ingested == 7

    export = store.export_trace(sid)

    # session_started (server, seq 0) precedes the client events.
    assert export.events[0].type == EventType.SESSION_STARTED
    assert export.events[0].seq == 0
    assert [e.seq for e in export.events] == list(range(8))

    # Lifecycle projected onto the session row.
    assert export.session.status == "submitted"
    assert export.session.marked_ready is True
    assert export.session.started_at is not None
    assert export.session.final_files == {"src/cart.ts": "line a\nline B changed\n"}
    assert export.session.candidate_name == "Ada L"

    # Two edits to one path -> one reconstructed diff (the second snapshot).
    diffs_for_cart = [d for d in export.file_diffs if d.path == "src/cart.ts"]
    assert len(diffs_for_cart) == 2
    assert "line B changed" in diffs_for_cart[-1].unified


def test_ingest_is_idempotent(store):
    base = datetime(2026, 6, 22, 12, 0, 0, tzinfo=timezone.utc)
    sid = store.create_session(
        SessionCreate(task_id="v1-cart-discount", candidate_name="Grace H")
    )
    batch = EventBatch(events=[
        TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.FILE_OPENED,
                     payload={"path": "src/cart.ts"}),
    ])
    store.ingest_events(sid, batch)
    store.ingest_events(sid, batch)  # replayed flush

    export = store.export_trace(sid)
    # seq 0 (session_started) + a single seq 1, not two.
    assert [e.seq for e in export.events] == [0, 1]


def test_timeout_sets_status(store):
    base = datetime(2026, 6, 22, 12, 0, 0, tzinfo=timezone.utc)
    sid = store.create_session(
        SessionCreate(task_id="v1-cart-discount", candidate_name="Edsger D")
    )
    store.ingest_events(sid, EventBatch(events=[
        TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.ASSESSMENT_STARTED),
        TraceEventIn(seq=2, client_ts=_ts(base, 600), type=EventType.TIMED_OUT),
    ]))
    export = store.export_trace(sid)
    assert export.session.status == "timed_out"
    assert export.session.ended_at is not None


# ---- diff-at-ingest --------------------------------------------------------

def _new_session(store, name="Diff Tester"):
    return store.create_session(
        SessionCreate(task_id="v1-cart-discount", candidate_name=name)
    )


def test_file_edited_diff_stamped_at_ingest(store):
    base = datetime(2026, 6, 25, 12, 0, 0, tzinfo=timezone.utc)
    sid = _new_session(store)
    store.ingest_events(sid, EventBatch(events=[
        TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.FILE_EDITED,
                     payload={"path": "src/cart.ts", "content": "a\nb\n"}),
        TraceEventIn(seq=2, client_ts=_ts(base, 2), type=EventType.FILE_EDITED,
                     payload={"path": "src/cart.ts", "content": "a\nB\n"}),
    ]))
    edits = [e for e in store.export_trace(sid).events if e.type == EventType.FILE_EDITED]
    # Every edit persists its own diff: first vs empty, second vs the first snapshot.
    assert "+a\n" in edits[0].payload["diff"]
    assert "-b\n" in edits[1].payload["diff"]
    assert "+B\n" in edits[1].payload["diff"]


def test_test_edited_is_distinct_and_diffed(store):
    base = datetime(2026, 6, 25, 12, 0, 0, tzinfo=timezone.utc)
    sid = _new_session(store)
    store.ingest_events(sid, EventBatch(events=[
        TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.FILE_EDITED,
                     payload={"path": "src/cart.ts", "content": "x\n"}),
        TraceEventIn(seq=2, client_ts=_ts(base, 2), type=EventType.TEST_EDITED,
                     payload={"path": "src/cart.test.ts", "content": "it('a', () => {});\n"}),
    ]))
    export = store.export_trace(sid)
    te = next(e for e in export.events if e.type == EventType.TEST_EDITED)
    assert te.type == EventType.TEST_EDITED  # not collapsed into file_edited
    assert "diff" in te.payload and te.payload["diff"]
    # test_edited snapshots also feed the export's reconstructed file_diffs.
    assert any(d.path == "src/cart.test.ts" for d in export.file_diffs)


def test_diff_is_replay_safe(store):
    # Re-ingesting an identical batch must NOT diff an event against itself.
    base = datetime(2026, 6, 25, 12, 0, 0, tzinfo=timezone.utc)
    sid = _new_session(store)

    def fresh_batch():
        return EventBatch(events=[
            TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.FILE_EDITED,
                         payload={"path": "src/cart.ts", "content": "one\n"}),
            TraceEventIn(seq=2, client_ts=_ts(base, 2), type=EventType.FILE_EDITED,
                         payload={"path": "src/cart.ts", "content": "two\n"}),
        ])

    store.ingest_events(sid, fresh_batch())
    first = [e.payload["diff"] for e in store.export_trace(sid).events
             if e.type == EventType.FILE_EDITED]
    store.ingest_events(sid, fresh_batch())  # replayed flush, same seqs
    second = [e.payload["diff"] for e in store.export_trace(sid).events
              if e.type == EventType.FILE_EDITED]

    assert first == second              # stable across replay
    assert all(d for d in second)       # none collapsed to an empty (self) diff
    assert "+two\n" in second[1]


def test_diff_baseline_spans_batches(store):
    # An edit in a later batch diffs against the snapshot stored in an earlier one.
    base = datetime(2026, 6, 25, 12, 0, 0, tzinfo=timezone.utc)
    sid = _new_session(store)
    store.ingest_events(sid, EventBatch(events=[
        TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.FILE_EDITED,
                     payload={"path": "src/cart.ts", "content": "alpha\n"}),
    ]))
    store.ingest_events(sid, EventBatch(events=[
        TraceEventIn(seq=2, client_ts=_ts(base, 2), type=EventType.FILE_EDITED,
                     payload={"path": "src/cart.ts", "content": "alpha\nbeta\n"}),
    ]))
    second = next(e for e in store.export_trace(sid).events
                  if e.type == EventType.FILE_EDITED and e.seq == 2)
    assert "+beta\n" in second.payload["diff"]
    assert "-alpha\n" not in second.payload["diff"]  # alpha is unchanged context


# ---- submit decision projection -------------------------------------------

def test_submit_fields_projected_onto_session(store):
    base = datetime(2026, 6, 25, 12, 0, 0, tzinfo=timezone.utc)
    sid = _new_session(store)
    store.ingest_events(sid, EventBatch(events=[
        TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.MARKED_READY,
                     payload={"files": {"src/cart.ts": "x\n"},
                              "verify_claim": "ran_tests",
                              "decision": "ship_with_caveats",
                              "confidence": "high",
                              "team_summary": "codes stack additively; flagged the $0 cap",
                              "reflection": ""}),
    ]))
    s = store.export_trace(sid).session
    assert s.status == "submitted" and s.marked_ready is True
    assert s.decision == "ship_with_caveats"
    assert s.confidence == "high"
    assert s.team_summary == "codes stack additively; flagged the $0 cap"


def test_submit_fields_optional(store):
    base = datetime(2026, 6, 25, 12, 0, 0, tzinfo=timezone.utc)
    sid = _new_session(store)
    store.ingest_events(sid, EventBatch(events=[
        TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.MARKED_READY,
                     payload={"files": {}, "verify_claim": "trusted", "reflection": ""}),
    ]))
    s = store.export_trace(sid).session
    assert s.marked_ready is True
    assert s.decision is None and s.confidence is None and s.team_summary is None


def test_test_run_records_which_tests(store):
    base = datetime(2026, 6, 25, 12, 0, 0, tzinfo=timezone.utc)
    sid = _new_session(store)
    store.ingest_events(sid, EventBatch(events=[
        TraceEventIn(seq=1, client_ts=_ts(base, 1), type=EventType.TEST_RUN,
                     payload={"result": {"passed": 1, "failed": 1, "total": 2},
                              "tests": [{"name": "applies 10%", "status": "pass"},
                                        {"name": "rejects bad code", "status": "fail"}]}),
    ]))
    run = next(e for e in store.export_trace(sid).events if e.type == EventType.TEST_RUN)
    assert run.payload["result"]["total"] == 2
    names = {t["name"]: t["status"] for t in run.payload["tests"]}
    assert names == {"applies 10%": "pass", "rejects bad code": "fail"}

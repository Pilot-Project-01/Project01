"""Session + trace-event persistence on Supabase, plus the scoring export.

All writes go through the service-role client (RLS-bypassing) — this module is
the only place sessions and events are mutated. Event ingest is idempotent on
(session_id, seq) so a client retrying a flush never double-records.
"""

import difflib

from app.clients.supabase import get_supabase
from app.core.events import (
    CLOCK_START_EVENTS,
    MARK_READY_EVENTS,
    SNAPSHOT_EVENTS,
    TERMINAL_EVENTS,
    EventType,
)
from app.models.trace import (
    EventBatch,
    FileDiff,
    Session,
    SessionCreate,
    SessionSummary,
    TraceEventOut,
    TraceExport,
)


class SessionNotFoundError(Exception):
    pass


# The server-emitted session_started occupies seq 0; the client starts at seq 1.
_SESSION_STARTED_SEQ = 0


def create_session(body: SessionCreate) -> str:
    db = get_supabase()
    row = (
        db.table("sessions")
        .insert(
            {
                "task_id": body.task_id,
                "candidate_name": body.candidate_name,
                "status": "created",
            }
        )
        .execute()
        .data[0]
    )
    session_id = row["id"]

    # Server emits session_started so the log always opens with it, regardless
    # of what the client manages to flush.
    db.table("trace_events").insert(
        {
            "session_id": session_id,
            "seq": _SESSION_STARTED_SEQ,
            "client_ts": row["created_at"],
            "type": EventType.SESSION_STARTED.value,
            "payload": {
                "task_id": body.task_id,
                "candidate_name": body.candidate_name,
            },
        }
    ).execute()
    return session_id


def _get_session_row(session_id: str) -> dict:
    rows = (
        get_supabase().table("sessions").select("*").eq("id", session_id).execute().data
    )
    if not rows:
        raise SessionNotFoundError(session_id)
    return rows[0]


def ingest_events(session_id: str, batch: EventBatch) -> int:
    db = get_supabase()
    _get_session_row(session_id)  # 404 if unknown

    _fill_edit_diffs(session_id, batch)

    rows = [
        {
            "session_id": session_id,
            "seq": e.seq,
            "client_ts": e.client_ts.isoformat(),
            "type": e.type.value,
            "payload": e.payload,
        }
        for e in batch.events
    ]
    # Idempotent: a retried flush with the same seq overwrites rather than dupes.
    db.table("trace_events").upsert(rows, on_conflict="session_id,seq").execute()

    _apply_side_effects(session_id, batch)
    return len(rows)


def _fill_edit_diffs(session_id: str, batch: EventBatch) -> None:
    """Persist a unified diff on every file_edited / test_edited event.

    We keep full-file snapshots (the diff baseline + what analysis reads), but
    also stamp each edit with its own diff vs the previous snapshot of that path,
    so the raw trace is self-describing without post-hoc reconstruction.

    One query per batch (not per event), so this stays cheap at pilot scale.
    Replay-safe: the baseline is built only from snapshots strictly *before* this
    batch's first snapshot seq, so re-ingesting the same batch recomputes
    identical diffs rather than diffing an event against itself.
    """
    batch_snaps = sorted(
        (e for e in batch.events if e.type in SNAPSHOT_EVENTS),
        key=lambda e: e.seq,
    )
    if not batch_snaps:
        return

    floor_seq = batch_snaps[0].seq
    snapshot_types = {t.value for t in SNAPSHOT_EVENTS}
    prior = (
        get_supabase()
        .table("trace_events")
        .select("*")
        .eq("session_id", session_id)
        .order("seq")
        .execute()
        .data
    )
    last_content: dict[str, str] = {}
    for r in prior:
        if r["type"] not in snapshot_types or r["seq"] >= floor_seq:
            continue
        path, content = r["payload"].get("path"), r["payload"].get("content")
        if isinstance(path, str) and isinstance(content, str):
            last_content[path] = content

    for e in batch_snaps:
        path, content = e.payload.get("path"), e.payload.get("content")
        if not isinstance(path, str) or not isinstance(content, str):
            continue
        prev = last_content.get(path, "")
        e.payload["diff"] = "".join(
            difflib.unified_diff(
                prev.splitlines(keepends=True),
                content.splitlines(keepends=True),
                fromfile=f"{path}@prev",
                tofile=f"{path}@seq{e.seq}",
            )
        )
        last_content[path] = content


def _apply_side_effects(session_id: str, batch: EventBatch) -> None:
    """Project lifecycle-bearing events onto the session row.

    Last-write-wins within a batch is fine: the events are ordered by seq and
    these fields are monotonic in practice (start, then ready/timeout).
    """
    db = get_supabase()
    update: dict = {}
    for e in sorted(batch.events, key=lambda x: x.seq):
        if e.type in CLOCK_START_EVENTS:
            update["started_at"] = e.client_ts.isoformat()
            update["status"] = "in_progress"
        elif e.type in MARK_READY_EVENTS:
            update["marked_ready"] = True
            update["status"] = "submitted"
            files = e.payload.get("files")
            if isinstance(files, dict):
                update["final_files"] = files
            # Project the structured submit decision onto the row for the
            # dashboard (team_summary is the primary Scope-moment evidence).
            for field in ("decision", "confidence", "team_summary"):
                value = e.payload.get(field)
                if value is not None:
                    update[field] = value
        elif e.type in TERMINAL_EVENTS:
            update["ended_at"] = e.client_ts.isoformat()
            if e.type == EventType.TIMED_OUT:
                update["status"] = "timed_out"

    if update:
        db.table("sessions").update(update).eq("id", session_id).execute()


def list_sessions() -> list[SessionSummary]:
    rows = (
        get_supabase()
        .table("sessions")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data
    )
    return [SessionSummary(**r) for r in rows]


def export_trace(session_id: str) -> TraceExport:
    db = get_supabase()
    session = Session(**_get_session_row(session_id))
    event_rows = (
        db.table("trace_events")
        .select("*")
        .eq("session_id", session_id)
        .order("seq")
        .execute()
        .data
    )
    events = [TraceEventOut(**r) for r in event_rows]
    return TraceExport(
        session=session,
        events=events,
        file_diffs=_compute_file_diffs(events),
    )


def _compute_file_diffs(events: list[TraceEventOut]) -> list[FileDiff]:
    """Unified diffs between consecutive snapshots of each path.

    Covers both file_edited and test_edited (the test file is edited via its own
    event). We store full-file snapshots (not keystroke diffs) and reconstruct
    the diffs here, at read time, purely for the human scorer's convenience.
    """
    last_content: dict[str, str] = {}
    diffs: list[FileDiff] = []
    for e in events:
        if e.type not in SNAPSHOT_EVENTS:
            continue
        path = e.payload.get("path")
        content = e.payload.get("content")
        if not isinstance(path, str) or not isinstance(content, str):
            continue
        prev = last_content.get(path, "")
        unified = "".join(
            difflib.unified_diff(
                prev.splitlines(keepends=True),
                content.splitlines(keepends=True),
                fromfile=f"{path}@prev",
                tofile=f"{path}@seq{e.seq}",
            )
        )
        if unified:
            diffs.append(FileDiff(path=path, unified=unified))
        last_content[path] = content
    return diffs

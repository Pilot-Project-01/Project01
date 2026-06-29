"""The trace event vocabulary.

These are exactly the event types from the CLAUDE.md trace schema. The harness
captures an ordered log per session; order and timing are the signal, so every
event carries a client-supplied seq and client_ts (set on the frontend).
"""

from enum import Enum


class EventType(str, Enum):
    SESSION_STARTED = "session_started"
    ASSESSMENT_STARTED = "assessment_started"
    AGENT_NOTE_VIEWED = "agent_note_viewed"
    FILE_OPENED = "file_opened"
    FILE_EDITED = "file_edited"
    CODE_RUN = "code_run"
    TEST_ADDED = "test_added"
    TEST_EDITED = "test_edited"
    TEST_RUN = "test_run"
    MARKED_READY = "marked_ready"
    SESSION_ENDED = "session_ended"
    TIMED_OUT = "timed_out"


# Events that mutate the session row when ingested (see trace_store).
CLOCK_START_EVENTS = {EventType.ASSESSMENT_STARTED}
MARK_READY_EVENTS = {EventType.MARKED_READY}
TERMINAL_EVENTS = {EventType.TIMED_OUT, EventType.SESSION_ENDED}

# Events that carry a full-file snapshot we diff against the previous one at
# ingest, so every edit persists its own unified diff (see trace_store).
SNAPSHOT_EVENTS = {EventType.FILE_EDITED, EventType.TEST_EDITED}

"""Request/response shapes for tasks, sessions, and trace events."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.core.events import EventType


# ---- Tasks -----------------------------------------------------------------

class TaskManifest(BaseModel):
    """What the candidate sees: the editable files plus the framing text.

    Deliberately omits the answer key — see task_loader, which serves only
    files on the manifest allowlist.
    """

    task_id: str
    prompt: str                      # TASK.md
    agent_note: str                  # AGENT_NOTE.md
    files: dict[str, str]            # {sandbox_path: content}, e.g. "src/cart.ts"
    entry: str                       # path of the file to open first


# ---- Sessions --------------------------------------------------------------

class SessionCreate(BaseModel):
    task_id: str
    candidate_name: str = Field(min_length=1)


class SessionCreated(BaseModel):
    session_id: str


class Session(BaseModel):
    id: str
    created_at: datetime
    updated_at: datetime
    task_id: str
    candidate_name: str
    started_at: datetime | None = None
    ended_at: datetime | None = None
    status: str
    marked_ready: bool
    final_files: dict[str, str] | None = None
    # Structured submit decision (null until the candidate submits).
    decision: str | None = None        # "ship" | "ship_with_caveats" | "block"
    confidence: str | None = None      # "low" | "medium" | "high"
    team_summary: str | None = None    # required free-text at submit


# ---- Trace events ----------------------------------------------------------

class TraceEventIn(BaseModel):
    """One buffered event from the browser. seq is monotonic per session."""

    seq: int = Field(ge=0)
    client_ts: datetime
    type: EventType
    payload: dict = Field(default_factory=dict)


class EventBatch(BaseModel):
    events: list[TraceEventIn] = Field(min_length=1)


class TraceEventOut(TraceEventIn):
    id: str
    created_at: datetime


class FileDiff(BaseModel):
    path: str
    unified: str                     # unified diff vs the previous snapshot


class TraceExport(BaseModel):
    """Everything needed to hand-score one session."""

    session: Session
    events: list[TraceEventOut]
    file_diffs: list[FileDiff]       # computed from consecutive file_edited snapshots


class VerificationCheck(BaseModel):
    key: str
    label: str
    status: str            # "yes" | "no" | "warn"
    detail: str = ""
    evidence_seq: int | None = None  # the trace event that justifies it


class MomentSignal(BaseModel):
    key: str
    title: str
    signal: str            # "missed" | "noticed" | "acted" — a HINT, not a score
    evidence: str = ""


class CodeComparison(BaseModel):
    path: str
    original: str          # the agent's code
    final: str             # what the candidate shipped
    unified: str           # unified diff agent -> shipped


class SelfReport(BaseModel):
    verify_claim: str | None = None
    verify_claim_label: str = ""
    reflection: str = ""
    # The structured submit decision + its primary free-text evidence.
    decision: str | None = None
    decision_label: str = ""
    confidence: str | None = None
    team_summary: str = ""


class SessionAnalysis(BaseModel):
    """Computed scoring aids for the dashboard. Heuristic hints; the human
    assigns the final ladder score (v1 scoring is manual)."""

    session: Session
    verification: list[VerificationCheck]
    moments: list[MomentSignal]
    code: list[CodeComparison]
    self_report: SelfReport


class ComparisonRow(BaseModel):
    """One candidate's compact scoring profile, for the side-by-side compare view."""

    id: str
    candidate_name: str
    status: str
    created_at: datetime
    verify_claim_label: str
    reflection: str
    decision: str | None = None
    decision_label: str = ""
    confidence: str | None = None
    team_summary: str = ""
    verification: list[VerificationCheck]
    moments: list[MomentSignal]


class SessionSummary(BaseModel):
    id: str
    candidate_name: str
    task_id: str
    status: str
    marked_ready: bool
    created_at: datetime
    started_at: datetime | None = None
    ended_at: datetime | None = None
    decision: str | None = None

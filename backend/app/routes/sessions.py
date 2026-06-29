from fastapi import APIRouter, Depends, HTTPException

from app.core.security import require_admin
from app.models.trace import (
    ComparisonRow,
    EventBatch,
    SessionAnalysis,
    SessionCreate,
    SessionCreated,
    SessionSummary,
    TraceExport,
)
from app.services import analysis, trace_store

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


# --- Candidate-facing writes (public) ---------------------------------------

@router.post("", response_model=SessionCreated, status_code=201)
def create_session(body: SessionCreate) -> SessionCreated:
    session_id = trace_store.create_session(body)
    return SessionCreated(session_id=session_id)


# --- Admin reads (require ADMIN_API_TOKEN) ----------------------------------

@router.get("", response_model=list[SessionSummary], dependencies=[Depends(require_admin)])
def list_sessions() -> list[SessionSummary]:
    return trace_store.list_sessions()


# Literal path — declared before the /{session_id}/... routes.
@router.get(
    "/comparison",
    response_model=list[ComparisonRow],
    dependencies=[Depends(require_admin)],
)
def comparison() -> list[ComparisonRow]:
    return analysis.build_comparison()


@router.post("/{session_id}/events")
def ingest_events(session_id: str, batch: EventBatch) -> dict:
    try:
        count = trace_store.ingest_events(session_id, batch)
    except trace_store.SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ingested": count}


@router.get(
    "/{session_id}/trace",
    response_model=TraceExport,
    dependencies=[Depends(require_admin)],
)
def export_trace(session_id: str) -> TraceExport:
    try:
        return trace_store.export_trace(session_id)
    except trace_store.SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")


@router.get(
    "/{session_id}/analysis",
    response_model=SessionAnalysis,
    dependencies=[Depends(require_admin)],
)
def session_analysis(session_id: str) -> SessionAnalysis:
    try:
        return analysis.build_analysis(session_id)
    except analysis.SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")

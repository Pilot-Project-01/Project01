// Formatting helpers for the trace dashboard.

import {
  DECISION_LABELS,
  VERIFY_CLAIM_LABELS,
  type Decision,
  type EventType,
  type TraceEventOut,
  type VerifyClaim,
} from "@/types/trace";

const EVENT_LABELS: Record<EventType, string> = {
  session_started: "Session created",
  assessment_started: "Clock started",
  agent_note_viewed: "Viewed agent note",
  file_opened: "Opened file",
  file_edited: "Edited file",
  code_run: "Ran code",
  test_added: "Added test",
  test_edited: "Edited test file",
  test_run: "Ran tests",
  marked_ready: "Submitted review",
  session_ended: "Session ended",
  timed_out: "Timed out",
};

export function eventLabel(type: EventType): string {
  return EVENT_LABELS[type] ?? type;
}

// A one-line, human-readable summary of an event's payload for the timeline.
export function eventDetail(e: TraceEventOut): string {
  const p = e.payload;
  switch (e.type) {
    case "file_opened":
    case "file_edited":
    case "test_added":
    case "test_edited":
      return typeof p.path === "string" ? p.path : "";
    case "agent_note_viewed":
      return typeof p.dwell_ms === "number" ? `${(p.dwell_ms / 1000).toFixed(1)}s` : "";
    case "test_run": {
      const r = p.result as { passed?: number; failed?: number } | undefined;
      if (!r) return "";
      return `${r.passed ?? 0} passed, ${r.failed ?? 0} failed`;
    }
    case "code_run": {
      if (typeof p.output !== "string") return "";
      const oneLine = p.output.replace(/\s+/g, " ").trim();
      const snippet = oneLine.length > 120 ? oneLine.slice(0, 120) + "…" : oneLine;
      return p.truncated ? `${snippet} (truncated)` : snippet;
    }
    case "marked_ready": {
      const decision = p.decision as Decision | undefined;
      const decisionLabel = decision ? DECISION_LABELS[decision] : "";
      const claim = p.verify_claim as VerifyClaim | undefined;
      const claimLabel = claim ? VERIFY_CLAIM_LABELS[claim] : "";
      const files = p.files as Record<string, string> | undefined;
      const count = files ? `${Object.keys(files).length} files` : "";
      return [decisionLabel, claimLabel, count].filter(Boolean).join(" · ");
    }
    case "session_started":
      return typeof p.candidate_name === "string" ? p.candidate_name : "";
    default:
      return "";
  }
}

// HH:MM:SS in the viewer's locale.
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Elapsed time since a reference point (the clock start), as m:ss.
export function elapsed(iso: string, startIso: string | null): string {
  if (!startIso) return "";
  const ms = new Date(iso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return "";
  const total = Math.floor(ms / 1000);
  return `+${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

export function statusTone(status: string): string {
  switch (status) {
    case "submitted":
      return "text-success";
    case "timed_out":
      return "text-danger";
    case "in_progress":
      return "text-accent";
    default:
      return "text-muted";
  }
}

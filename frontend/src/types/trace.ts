// Mirror of the backend trace vocabulary (app/core/events.py). Order + timing
// are the signal, so every event carries a monotonic seq and a client timestamp.

export type EventType =
  | "session_started"
  | "assessment_started"
  | "agent_note_viewed"
  | "file_opened"
  | "file_edited"
  | "code_run"
  | "test_added"
  | "test_edited"
  | "test_run"
  | "marked_ready"
  | "session_ended"
  | "timed_out";

// At ship time we ask whether the candidate verified the agent's "I tested it"
// claim. The answer is checked against the trace (e.g. "ran_tests" with no
// test_run event is a tell).
export type VerifyClaim = "ran_tests" | "read_not_run" | "trusted";

export const VERIFY_CLAIM_LABELS: Record<VerifyClaim, string> = {
  ran_tests: "Ran the tests myself",
  read_not_run: "Read the tests but didn't run them",
  trusted: "Trusted the agent's note",
};

// The submit decision: is this change ready to ship, and how sure are they?
export type Decision = "ship" | "ship_with_caveats" | "block";
export type Confidence = "low" | "medium" | "high";

export const DECISION_LABELS: Record<Decision, string> = {
  ship: "Ship it",
  ship_with_caveats: "Ship with caveats",
  block: "Block — not ready",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// One executed test case, captured from the Tests panel result tree.
export interface TestResult {
  name: string;
  status: "pass" | "fail";
}

// Per-type payload shapes (loose by design — the scorer reads these by hand).
export interface EventPayloads {
  session_started: { task_id: string; candidate_name: string };
  assessment_started: Record<string, never>;
  agent_note_viewed: { dwell_ms: number };
  file_opened: { path: string };
  // content is the full-file snapshot; the backend stamps a `diff` onto the
  // stored payload at ingest (the client doesn't send it).
  file_edited: { path: string; content: string };
  // The test file is edited via its own event, kept distinct from file_edited.
  test_edited: { path: string; content: string };
  // Verbatim scratchpad source + console output. Output is capped (truncated
  // flag set) so a runaway loop can't bloat the trace.
  code_run: { command: string; source: string; output: string; truncated: boolean };
  test_added: { path: string };
  test_run: {
    result: { passed: number; failed: number; total: number };
    tests: TestResult[]; // which tests ran, and their outcome
  };
  marked_ready: {
    files: Record<string, string>;
    // Structured trust-vs-verify answer, cross-checkable against the trace.
    verify_claim: VerifyClaim;
    // The ship/caveat/block decision + how confident they are.
    decision: Decision;
    confidence: Confidence;
    // Required neutral hand-off note — the primary evidence for the Scope moments.
    team_summary: string;
    // Free-text: what they changed / checked. Optional.
    reflection: string;
  };
  session_ended: Record<string, never>;
  timed_out: Record<string, never>;
}

export interface TraceEventInput<T extends EventType = EventType> {
  seq: number;
  client_ts: string; // ISO 8601
  type: T;
  payload: EventPayloads[T];
}

// ---- Dashboard read models (mirror backend app/models/trace.py) ----

export interface SessionSummary {
  id: string;
  candidate_name: string;
  task_id: string;
  status: string;
  marked_ready: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface TraceEventOut {
  id: string;
  created_at: string;
  seq: number;
  client_ts: string;
  type: EventType;
  payload: Record<string, unknown>;
}

export interface FileDiff {
  path: string;
  unified: string;
}

export interface Session extends SessionSummary {
  updated_at: string;
  final_files: Record<string, string> | null;
  decision: Decision | null;
  confidence: Confidence | null;
  team_summary: string | null;
}

export interface TraceExport {
  session: Session;
  events: TraceEventOut[];
  file_diffs: FileDiff[];
}

// ---- Analysis (mirror backend SessionAnalysis) ----

export interface VerificationCheck {
  key: string;
  label: string;
  status: "yes" | "no" | "warn";
  detail: string;
  evidence_seq: number | null;
}

export interface MomentSignal {
  key: string;
  title: string;
  signal: "missed" | "noticed" | "acted";
  evidence: string;
}

export interface CodeComparison {
  path: string;
  original: string;
  final: string;
  unified: string;
}

export interface SelfReport {
  verify_claim: string | null;
  verify_claim_label: string;
  reflection: string;
  decision: Decision | null;
  decision_label: string;
  confidence: Confidence | null;
  team_summary: string;
}

export interface SessionAnalysis {
  session: Session;
  verification: VerificationCheck[];
  moments: MomentSignal[];
  code: CodeComparison[];
  self_report: SelfReport;
}

export interface ComparisonRow {
  id: string;
  candidate_name: string;
  status: string;
  created_at: string;
  verify_claim_label: string;
  reflection: string;
  decision: Decision | null;
  decision_label: string;
  confidence: Confidence | null;
  team_summary: string;
  verification: VerificationCheck[];
  moments: MomentSignal[];
}

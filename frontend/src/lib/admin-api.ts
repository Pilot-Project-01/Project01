import "server-only";

// Admin reads of the trace API. Imported ONLY by server components — the
// `server-only` guard makes the build fail if this is ever pulled into client
// code, so ADMIN_API_TOKEN can never ship to a browser.

import type {
  ComparisonRow,
  SessionAnalysis,
  SessionSummary,
  TraceExport,
} from "@/types/trace";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? "";

async function adminGet<T>(path: string): Promise<T> {
  if (!ADMIN_TOKEN) {
    throw new Error("ADMIN_API_TOKEN is not set on the server.");
  }
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function fetchSessions(): Promise<SessionSummary[]> {
  return adminGet("/api/v1/sessions");
}

export function fetchTrace(sessionId: string): Promise<TraceExport> {
  return adminGet(`/api/v1/sessions/${sessionId}/trace`);
}

export function fetchAnalysis(sessionId: string): Promise<SessionAnalysis> {
  return adminGet(`/api/v1/sessions/${sessionId}/analysis`);
}

export function fetchComparison(): Promise<ComparisonRow[]> {
  return adminGet("/api/v1/sessions/comparison");
}

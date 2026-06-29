import Link from "next/link";

import { fetchSessions } from "@/lib/admin-api";
import { clockTime, statusTone } from "@/lib/format";
import type { SessionSummary } from "@/types/trace";

// Internal trace viewer. No auth in v1 (run on people we know); this is a
// read-only window onto sessions for manual hand-scoring.
export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  let sessions: SessionSummary[] = [];
  let error: string | null = null;
  try {
    sessions = await fetchSessions();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load sessions";
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-muted">Assessment sessions, newest first. Click one to inspect its trace.</p>
        </div>
        <Link
          href="/admin/compare"
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Compare all →
        </Link>
      </header>

      {error ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-danger shadow-sm">
          {error} — is the backend running?
        </p>
      ) : sessions.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted shadow-sm">
          No sessions yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/sessions/${s.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{s.candidate_name}</span>
                  <span className="text-xs text-muted">
                    {s.task_id} · {clockTime(s.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {s.marked_ready && (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      shipped
                    </span>
                  )}
                  <span className={`font-medium ${statusTone(s.status)}`}>{s.status}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

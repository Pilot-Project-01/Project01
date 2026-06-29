import Link from "next/link";

import { fetchAnalysis, fetchTrace } from "@/lib/admin-api";
import { clockTime, elapsed, eventDetail, eventLabel, statusTone } from "@/lib/format";
import type {
  MomentSignal,
  SessionAnalysis,
  TraceExport,
  VerificationCheck,
} from "@/types/trace";

export const dynamic = "force-dynamic";

const KEY_EVENTS = new Set(["test_run", "code_run", "marked_ready", "timed_out"]);

export default async function SessionTracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trace: TraceExport | null = null;
  let analysis: SessionAnalysis | null = null;
  let error: string | null = null;
  try {
    [trace, analysis] = await Promise.all([fetchTrace(id), fetchAnalysis(id)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load session";
  }

  if (error || !trace || !analysis) {
    return (
      <main className="mx-auto w-full max-w-6xl p-6">
        <BackLink />
        <p className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm text-danger shadow-sm">
          {error ?? "Not found"}
        </p>
      </main>
    );
  }

  const { session, events } = trace;
  const start = session.started_at;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <BackLink />
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="text-2xl font-semibold tracking-tight">{session.candidate_name}</h1>
            <span className="text-xs text-muted">
              {session.task_id} · session {session.id}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {session.marked_ready && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                shipped
              </span>
            )}
            <span className={`font-medium ${statusTone(session.status)}`}>{session.status}</span>
          </div>
        </header>
      </div>

      <p className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted">
        The signals below are <strong className="text-foreground">heuristic hints</strong> to
        speed up scoring — not a grade. Verify against the timeline and assign the ladder
        yourself.
      </p>

      {/* Judgment aids: verification + per-moment scorecard, side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        <VerificationPanel checks={analysis.verification} />
        <MomentScorecard moments={analysis.moments} />
      </div>

      {/* Full-width timeline */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Timeline</h2>
        <ol className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {events.map((e) => {
            const detail = eventDetail(e);
            const key = KEY_EVENTS.has(e.type);
            return (
              <li
                key={e.id}
                className="flex items-baseline gap-3 border-b border-border px-4 py-2 last:border-0"
              >
                <span className="w-20 shrink-0 font-mono text-xs text-muted">
                  {clockTime(e.client_ts)}
                </span>
                <span className="w-12 shrink-0 font-mono text-xs text-muted">
                  {elapsed(e.client_ts, start)}
                </span>
                <span className={`min-w-[12rem] font-medium ${key ? "text-foreground" : "text-muted"}`}>
                  {eventLabel(e.type)}
                </span>
                {detail && <span className="truncate text-sm text-muted">{detail}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Self-report — prominent, at the end of the trace */}
      <SelfReportCard report={analysis.self_report} />

      {/* Code: the agent's version vs what the candidate shipped */}
      {analysis.code.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Code — agent&apos;s version → shipped
          </h2>
          {analysis.code.map((c) => (
            <details key={c.path} className="rounded-2xl border border-border bg-surface shadow-sm">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-2 text-sm font-medium">
                <span>{c.path}</span>
                <span className="text-xs text-muted">
                  {c.unified ? "changed" : "unchanged"}
                </span>
              </summary>
              {c.unified ? (
                <Diff unified={c.unified} />
              ) : (
                <pre className="overflow-auto border-t border-border p-4 font-mono text-xs text-muted">
                  (no changes from the agent&apos;s version)
                </pre>
              )}
            </details>
          ))}
        </section>
      )}
    </main>
  );
}

// ---- panels ----------------------------------------------------------------

function VerificationPanel({ checks }: { checks: VerificationCheck[] }) {
  const mark = { yes: "✓", no: "✗", warn: "⚠" };
  const tone = {
    yes: "text-success",
    no: "text-muted",
    warn: "text-danger",
  };
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Verification</h2>
      <ul className="flex flex-col gap-2">
        {checks.map((c) => (
          <li key={c.key} className="flex items-baseline gap-2 text-sm">
            <span className={`w-4 shrink-0 font-bold ${tone[c.status]}`}>{mark[c.status]}</span>
            <div className="flex flex-col">
              <span className={c.status === "warn" ? "font-medium text-danger" : ""}>
                {c.label}
              </span>
              {c.detail && <span className="text-xs text-muted">{c.detail}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MomentScorecard({ moments }: { moments: MomentSignal[] }) {
  const tone = {
    missed: "text-danger",
    noticed: "text-accent",
    acted: "text-success",
  };
  const dots = { missed: 1, noticed: 2, acted: 3 };
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Moments (calibrated)
      </h2>
      <ul className="flex flex-col gap-2.5">
        {moments.map((m) => (
          <li key={m.key} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{m.title}</span>
              <span className={`flex items-center gap-1 text-xs font-medium ${tone[m.signal]}`}>
                {m.signal}
                <span aria-hidden>
                  {"●".repeat(dots[m.signal])}
                  <span className="opacity-25">{"●".repeat(3 - dots[m.signal])}</span>
                </span>
              </span>
            </div>
            {m.evidence && <span className="text-xs text-muted">{m.evidence}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SelfReportCard({ report }: { report: SessionAnalysis["self_report"] }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border-2 border-accent/30 bg-accent/[0.04] p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
        Candidate&apos;s submitted review
      </h2>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted">Decision</span>
          <span className="text-base font-medium">{report.decision_label || "— no answer —"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted">Confidence</span>
          <span className="text-base font-medium capitalize">{report.confidence || "—"}</span>
        </div>
      </div>

      {/* Team summary — primary evidence for the Scope moments (over-discount, stacking). */}
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted">
          Summary for their team
        </span>
        {report.team_summary ? (
          <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-sm leading-relaxed">
            {report.team_summary}
          </p>
        ) : (
          <span className="text-sm text-muted">— left blank —</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted">
          Did they verify the agent&apos;s &ldquo;I tested it&rdquo; claim?
        </span>
        <span className="text-base font-medium">
          {report.verify_claim_label || "— no answer —"}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted">Notes</span>
        {report.reflection ? (
          <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-sm leading-relaxed">
            {report.reflection}
          </p>
        ) : (
          <span className="text-sm text-muted">— left blank —</span>
        )}
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/admin/sessions" className="text-sm text-accent hover:underline">
      ← All sessions
    </Link>
  );
}

function Diff({ unified }: { unified: string }) {
  return (
    <pre className="overflow-auto border-t border-border p-4 font-mono text-xs leading-relaxed">
      {unified.split("\n").map((line, i) => {
        let tone = "text-muted";
        if (line.startsWith("+") && !line.startsWith("+++")) tone = "text-success";
        else if (line.startsWith("-") && !line.startsWith("---")) tone = "text-danger";
        else if (line.startsWith("@@")) tone = "text-accent";
        return (
          <span key={i} className={`block ${tone}`}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

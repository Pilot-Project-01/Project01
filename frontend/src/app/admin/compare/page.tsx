import Link from "next/link";

import { fetchComparison } from "@/lib/admin-api";
import { clockTime } from "@/lib/format";
import type { ComparisonRow } from "@/types/trace";

export const dynamic = "force-dynamic";

// Stable column order so every candidate lines up.
const VERIF = [
  { key: "ran_tests_before_ship", short: "Tests" },
  { key: "ran_code", short: "Ran code" },
  { key: "opened_helper", short: "money.ts" },
  { key: "opened_test_file", short: "Test file" },
  { key: "read_agent_note", short: "Read note" },
  { key: "claim_vs_trace", short: "Honest" },
];
const MOMENTS = [
  { key: "float_bug", short: "Float bug" },
  { key: "ignored_helper", short: "Helper" },
  { key: "false_claim", short: "False claim" },
  { key: "input_mutation", short: "Mutation" },
  { key: "silent_overdiscount", short: "Over-disc." },
  { key: "silent_stacking", short: "Stacking" },
];

const VERIF_MARK: Record<string, string> = { yes: "✓", no: "·", warn: "⚠" };
const VERIF_TONE: Record<string, string> = {
  yes: "text-success",
  no: "text-muted/50",
  warn: "text-danger",
};
const MOMENT_TONE: Record<string, string> = {
  missed: "text-muted/50",
  noticed: "text-accent",
  acted: "text-success",
};
const MOMENT_MARK: Record<string, string> = { missed: "·", noticed: "◐", acted: "●" };

export default async function ComparePage() {
  let rows: ComparisonRow[] = [];
  let error: string | null = null;
  try {
    rows = await fetchComparison();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load comparison";
  }

  return (
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-5 p-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Compare sessions</h1>
          <p className="text-muted">
            Every candidate side by side. Scan a column to see who verified what — the
            strong/weak gap should show up as rows that light up vs. rows that stay grey.
          </p>
        </div>
        <Link href="/admin/sessions" className="shrink-0 text-sm text-accent hover:underline">
          ← All sessions
        </Link>
      </header>

      {error ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-danger shadow-sm">
          {error} — is the backend running?
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted shadow-sm">
          No sessions yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">Candidate</th>
                {VERIF.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-center font-medium" title={c.key}>
                    {c.short}
                  </th>
                ))}
                <th className="w-2 bg-border/40 px-0" />
                {MOMENTS.map((m) => (
                  <th key={m.key} className="px-2 py-2 text-center font-medium" title={m.key}>
                    {m.short}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Team summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = Object.fromEntries(r.verification.map((c) => [c.key, c.status]));
                const m = Object.fromEntries(r.moments.map((x) => [x.key, x.signal]));
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface">
                    <td className="sticky left-0 z-10 bg-background px-3 py-2">
                      <Link
                        href={`/admin/sessions/${r.id}`}
                        className="flex flex-col hover:underline"
                      >
                        <span className="font-medium">{r.candidate_name}</span>
                        <span className="text-xs text-muted">
                          {clockTime(r.created_at)} · {r.decision_label || "—"}
                          {r.confidence ? ` (${r.confidence})` : ""}
                        </span>
                      </Link>
                    </td>
                    {VERIF.map((c) => {
                      const status = v[c.key] ?? "no";
                      return (
                        <td
                          key={c.key}
                          className={`px-2 py-2 text-center text-base font-bold ${VERIF_TONE[status]}`}
                        >
                          {VERIF_MARK[status]}
                        </td>
                      );
                    })}
                    <td className="bg-border/40 px-0" />
                    {MOMENTS.map((mm) => {
                      const sig = m[mm.key] ?? "missed";
                      return (
                        <td
                          key={mm.key}
                          className={`px-2 py-2 text-center text-base ${MOMENT_TONE[sig]}`}
                          title={sig}
                        >
                          {MOMENT_MARK[sig]}
                        </td>
                      );
                    })}
                    <td className="max-w-sm px-3 py-2 align-top text-xs text-muted">
                      {r.team_summary || r.reflection ? (
                        <span className="line-clamp-3">{r.team_summary || r.reflection}</span>
                      ) : (
                        <span className="italic">— blank —</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        Verification: ✓ done · grey not done · ⚠ contradicts the trace. Moments: ● acted ·
        ◐ noticed · grey missed. All heuristic — click a name for the full trace.
      </p>
    </main>
  );
}

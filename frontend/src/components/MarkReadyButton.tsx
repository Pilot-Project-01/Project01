"use client";

import { useState } from "react";
import { useSandpack } from "@codesandbox/sandpack-react";

import type { TraceRecorder } from "@/lib/trace";
import {
  CONFIDENCE_LABELS,
  DECISION_LABELS,
  VERIFY_CLAIM_LABELS,
  type Confidence,
  type Decision,
  type VerifyClaim,
} from "@/types/trace";

interface MarkReadyButtonProps {
  recorder: TraceRecorder;
  disabled: boolean;
  onSubmitted: () => void;
}

const CLAIM_ORDER: VerifyClaim[] = ["ran_tests", "read_not_run", "trusted"];
const DECISION_ORDER: Decision[] = ["ship", "ship_with_caveats", "block"];
const CONFIDENCE_ORDER: Confidence[] = ["low", "medium", "high"];

// The submit captures the cleanest decision signal — ship / caveats / block,
// with a confidence level — plus a neutrally-framed team summary (the primary
// evidence for the Scope moments), a structured trust-vs-verify answer
// (cross-checked against the trace), and an optional free-text note. It also
// snapshots every candidate file. Framing is deliberately neutral: nothing
// hints that anything is wrong or missing.
export function MarkReadyButton({ recorder, disabled, onSubmitted }: MarkReadyButtonProps) {
  const { sandpack } = useSandpack();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [teamSummary, setTeamSummary] = useState("");
  const [claim, setClaim] = useState<VerifyClaim | null>(null);
  const [reflection, setReflection] = useState("");

  const ready =
    !!decision && !!confidence && !!claim && teamSummary.trim().length > 0;

  async function submit() {
    if (!ready || !decision || !confidence || !claim || submitting) return;
    setSubmitting(true);
    const files: Record<string, string> = {};
    for (const [path, file] of Object.entries(sandpack.files)) {
      if (path.startsWith("/src/") || path.startsWith("src/")) files[path] = file.code;
    }
    recorder.record("marked_ready", {
      files,
      verify_claim: claim,
      decision,
      confidence,
      team_summary: teamSummary.trim(),
      reflection: reflection.trim(),
    });
    // flush() never throws — it re-queues on failure, and the unload beacon is a
    // backstop — so locking the UI here is safe even on a flaky network.
    await recorder.flush();
    onSubmitted();
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={disabled}
        className="w-full rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Submit
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Submit your review</h2>

            {/* Decision */}
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Is this ready to ship?</p>
              <div className="flex flex-col gap-1.5">
                {DECISION_ORDER.map((d) => (
                  <label
                    key={d}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      decision === d ? "border-accent bg-accent/5" : "border-border hover:bg-background"
                    }`}
                  >
                    <input
                      type="radio"
                      name="decision"
                      checked={decision === d}
                      onChange={() => setDecision(d)}
                      className="accent-accent"
                    />
                    {DECISION_LABELS[d]}
                  </label>
                ))}
              </div>
            </div>

            {/* Confidence */}
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">How confident are you?</p>
              <div className="flex gap-1.5">
                {CONFIDENCE_ORDER.map((c) => (
                  <label
                    key={c}
                    className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      confidence === c ? "border-accent bg-accent/5" : "border-border hover:bg-background"
                    }`}
                  >
                    <input
                      type="radio"
                      name="confidence"
                      checked={confidence === c}
                      onChange={() => setConfidence(c)}
                      className="sr-only"
                    />
                    {CONFIDENCE_LABELS[c]}
                  </label>
                ))}
              </div>
            </div>

            {/* Team summary — required, neutral */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="team_summary" className="text-sm font-medium">
                Summary for your team
              </label>
              <textarea
                id="team_summary"
                value={teamSummary}
                onChange={(e) => setTeamSummary(e.target.value)}
                rows={4}
                placeholder="Summarize this change for the teammate who picks it up."
                className="resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>

            {/* Trust-vs-verify self report */}
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                The agent claimed it{" "}
                <span className="font-medium">validated and tested</span> this code. Which is
                true for you?
              </p>
              <div className="flex flex-col gap-1.5">
                {CLAIM_ORDER.map((c) => (
                  <label
                    key={c}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      claim === c ? "border-accent bg-accent/5" : "border-border hover:bg-background"
                    }`}
                  >
                    <input
                      type="radio"
                      name="verify_claim"
                      checked={claim === c}
                      onChange={() => setClaim(c)}
                      className="accent-accent"
                    />
                    {VERIFY_CLAIM_LABELS[c]}
                  </label>
                ))}
              </div>
            </div>

            {/* Optional notes — neutral */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reflection" className="text-sm">
                Notes (optional)
              </label>
              <textarea
                id="reflection"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={3}
                placeholder="Anything else you changed or checked."
                className="resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={!ready || submitting}
                className="flex-1 rounded-2xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="rounded-2xl border border-border px-4 py-2 text-sm transition-colors hover:bg-background disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-muted">You can&apos;t edit after submitting.</p>
          </div>
        </div>
      )}
    </>
  );
}

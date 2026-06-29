"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { fetchTask } from "@/lib/api";
import { TraceRecorder } from "@/lib/trace";
import type { TaskManifest } from "@/types/task";
import { WarmUp } from "@/components/WarmUp";
import { Workspace } from "@/components/Workspace";

const TASK_ID = "v1-cart-discount";

type Phase = "warmup" | "active" | "done";

export default function AssessmentPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [task, setTask] = useState<TaskManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("warmup");
  const [tourShown, setTourShown] = useState(false);
  const [clockStarted, setClockStarted] = useState(false);
  const [doneReason, setDoneReason] = useState<"submitted" | "timed_out" | null>(null);

  // One recorder for the whole session (lazy initializer runs once).
  const [recorder] = useState(() => new TraceRecorder(sessionId));

  useEffect(() => {
    fetchTask(TASK_ID)
      .then(setTask)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load task"));
  }, []);

  useEffect(() => recorder.installUnloadHandlers(), [recorder]);

  // Move to the task screen, but the clock is NOT running yet — the "ready?"
  // modal there starts it.
  function goToTask() {
    setTourShown(true); // they've seen the warm-up tour; don't auto-run it again
    setClockStarted(false);
    setPhase("active");
  }

  // The candidate confirmed on the task screen: start the clock for real.
  function startClock() {
    recorder.record("assessment_started", {});
    void recorder.flush();
    setClockStarted(true);
  }

  function finish(reason: "submitted" | "timed_out") {
    setDoneReason(reason);
    setPhase("done");
    void recorder.flush();
  }

  if (error) {
    return <main className="p-6 text-danger">Error: {error}</main>;
  }
  if (!task) {
    return <main className="p-6 text-muted">Loading task…</main>;
  }

  if (phase === "warmup") {
    return <WarmUp onStart={goToTask} autoTour={!tourShown} />;
  }

  if (phase === "done") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {doneReason === "timed_out" ? "Time's up" : "Submitted"}
        </h1>
        <p className="text-muted">
          {doneReason === "timed_out"
            ? "The 10 minutes are up — your session was captured."
            : "Thanks — your decision and session were recorded."}
        </p>
        <p className="text-xs text-muted/70">Session {sessionId}</p>
      </main>
    );
  }

  // phase === "active": the task screen renders; the timer only runs once the
  // candidate confirms in the modal below.
  return (
    <>
      <Workspace task={task} recorder={recorder} clockStarted={clockStarted} onDone={finish} />
      {!clockStarted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Ready to start?</h2>
            <p className="text-sm text-muted">
              This is the real task. The{" "}
              <strong className="text-foreground">10-minute timer starts</strong> when you
              click below — you can&apos;t pause once it begins.
            </p>
            <div className="flex gap-2">
              <button
                onClick={startClock}
                className="flex-1 rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                Start now — begin the timer
              </button>
              <button
                onClick={() => setPhase("warmup")}
                className="rounded-2xl border border-border px-4 py-2 text-sm transition-colors hover:bg-background"
              >
                Back to warm-up
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

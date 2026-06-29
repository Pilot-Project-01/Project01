"use client";

import { useCallback, useState } from "react";
import { SandpackProvider } from "@codesandbox/sandpack-react";

import type { TraceRecorder } from "@/lib/trace";
import type { TaskManifest } from "@/types/task";
import { capOutput, tallyTests } from "@/lib/trace-parse";
import { MarkReadyButton } from "@/components/MarkReadyButton";
import { Timer } from "@/components/Timer";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { useTraceBridge } from "@/components/useTraceBridge";
import { useWorkspaceTour } from "@/components/useWorkspaceTour";

const ASSESSMENT_MS = 10 * 60 * 1000;

interface WorkspaceProps {
  task: TaskManifest;
  recorder: TraceRecorder;
  clockStarted: boolean;
  onDone: (reason: "submitted" | "timed_out") => void;
}

const SCRATCHPAD = `// Scratchpad — this file runs live in the Output panel on the right.
// Use it to try the code with real inputs and see what actually happens.
import { applyDiscount } from "./src/cart";

const cart = { items: [{ name: "Notebook", price: 19.99, quantity: 1 }], total: 0 };
console.log("SAVE10 ->", applyDiscount(cart, ["SAVE10"]));
`;

export function Workspace({ task, recorder, clockStarted, onDone }: WorkspaceProps) {
  const files: Record<string, { code: string; active?: boolean }> = {
    // index.ts is the entry Sandpack runs — we make it an editable scratchpad
    // whose console output shows in the Output panel.
    "/index.ts": { code: SCRATCHPAD },
  };
  for (const [path, code] of Object.entries(task.files)) {
    files[path] = { code, active: path === task.entry };
  }

  return (
    <SandpackProvider
      template="vanilla-ts"
      files={files}
      // initMode "immediate" boots the test bundler on mount (its iframe is
      // hidden, so the default "lazy" viewport trigger never fires). autoReload
      // stays ON so edits recompile — otherwise Watch never fires and the Tests
      // panel shows stale results after a change.
      options={{ initMode: "immediate" }}
      theme="auto"
    >
      <WorkspaceInner task={task} recorder={recorder} clockStarted={clockStarted} onDone={onDone} />
    </SandpackProvider>
  );
}

function WorkspaceInner({ task, recorder, clockStarted, onDone }: WorkspaceProps) {
  useTraceBridge(recorder);
  const { startTour } = useWorkspaceTour(false); // the timed screen does NOT auto-tour
  const [locked, setLocked] = useState(false);

  const handleExpire = useCallback(() => {
    setLocked((wasLocked) => {
      if (wasLocked) return wasLocked;
      recorder.record("timed_out", {});
      void recorder.flush();
      onDone("timed_out");
      return true;
    });
  }, [recorder, onDone]);

  const handleTestComplete = useCallback(
    (specs: unknown) => {
      const { passed, failed, tests } = tallyTests(specs);
      recorder.record("test_run", {
        result: { passed, failed, total: passed + failed },
        tests,
      });
    },
    [recorder],
  );

  const handleAgentDwell = useCallback(
    (dwellMs: number) => recorder.record("agent_note_viewed", { dwell_ms: dwellMs }),
    [recorder],
  );

  const handleCodeRun = useCallback(
    (source: string, rawOutput: string) => {
      const { output, truncated } = capOutput(rawOutput);
      recorder.record("code_run", { command: "run index.ts", source, output, truncated });
    },
    [recorder],
  );

  return (
    <WorkspaceShell
      prompt={task.prompt}
      agentNote={task.agent_note}
      readOnly={locked}
      startTour={startTour}
      onTestComplete={handleTestComplete}
      onAgentDwell={handleAgentDwell}
      onCodeRun={handleCodeRun}
      timerNode={
        clockStarted ? (
          <Timer durationMs={ASSESSMENT_MS} onExpire={handleExpire} />
        ) : (
          <span className="font-mono text-2xl tabular-nums text-muted">10:00</span>
        )
      }
      actionNode={
        locked ? (
          <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted shadow-sm">
            Session locked.
          </p>
        ) : (
          <MarkReadyButton
            recorder={recorder}
            disabled={locked}
            onSubmitted={() => {
              setLocked(true);
              onDone("submitted");
            }}
          />
        )
      }
    />
  );
}

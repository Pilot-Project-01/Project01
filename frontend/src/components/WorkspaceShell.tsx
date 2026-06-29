"use client";

// Shared workspace layout used by BOTH the warm-up and the real assessment, so
// the warm-up looks and behaves like the real thing. Purely presentational +
// tab/dwell state; the trace recorder, timer, tour, and action button are
// injected by the caller (which lives inside the SandpackProvider).

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  SandpackCodeEditor,
  SandpackConsole,
  SandpackTests,
  useSandpack,
} from "@codesandbox/sandpack-react";

import { Markdown } from "@/components/Markdown";
import { joinLogs } from "@/lib/trace-parse";

const TEST_FILE = /\.(test|spec)\.[tj]sx?$/;

interface WorkspaceShellProps {
  prompt: string;
  agentNote: string;
  readOnly: boolean;
  timerNode: ReactNode; // live countdown (real) or a static display (warm-up)
  actionNode: ReactNode; // Mark-ready (real) or Start (warm-up)
  startTour: () => void;
  banner?: ReactNode; // optional full-width banner above the workspace
  onTestComplete?: (specs: unknown) => void;
  onAgentDwell?: (dwellMs: number) => void;
  onCodeRun?: (source: string, output: string) => void; // scratchpad run settled
}

export function WorkspaceShell({
  prompt,
  agentNote,
  readOnly,
  timerNode,
  actionNode,
  startTour,
  banner,
  onTestComplete,
  onAgentDwell,
  onCodeRun,
}: WorkspaceShellProps) {
  const [tab, setTab] = useState<"prompt" | "agent">("prompt");
  const { sandpack } = useSandpack();
  const testFileActive = TEST_FILE.test(sandpack.activeFile);

  // Measure how long the agent note is actually read, each time they leave it.
  const agentEnter = useRef<number | null>(null);
  useEffect(() => {
    if (tab === "agent") agentEnter.current = Date.now();
    return () => {
      if (agentEnter.current != null) {
        onAgentDwell?.(Date.now() - agentEnter.current);
        agentEnter.current = null;
      }
    };
  }, [tab, onAgentDwell]);

  // The Output panel runs index.ts live; debounce the logs into one code_run
  // event per settled run (rapid typing collapses into a single record).
  const codeRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOutput = useRef<string>("");
  function handleLogs(logs: Array<{ data?: unknown[] }>) {
    if (!onCodeRun || logs.length === 0) return;
    const output = joinLogs(logs);
    if (!output || output === lastOutput.current) return;
    if (codeRunTimer.current) clearTimeout(codeRunTimer.current);
    codeRunTimer.current = setTimeout(() => {
      lastOutput.current = output;
      // The scratchpad source the candidate actually ran, captured verbatim.
      const source = sandpack.files["/index.ts"]?.code ?? "";
      onCodeRun(source, output);
    }, 1200);
  }

  return (
    <div className="flex h-screen flex-col">
      {banner}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
      <div className="flex min-w-0 flex-[3] flex-col gap-3">
        <div data-tour="editor" className="overflow-hidden rounded-2xl border border-border shadow-sm">
          <SandpackCodeEditor
            readOnly={readOnly}
            showReadOnly={false}
            showTabs
            showLineNumbers
            // No preview in this task, so the editor's Run button does nothing
            // useful and is confusing — tests run from the Tests panel only.
            // Output is live (autoReload on), so the editor's Run button only
            // shows inconsistently (before the first run) — use the Output
            // panel's ↻ Re-run instead.
            showRunButton={false}
            style={{ height: "calc(55vh - 3.5rem)" }}
          />
        </div>
        <div className="flex min-h-0 flex-1 gap-3">
          <div
            data-tour="tests"
            className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5 text-xs">
              <span className="font-medium text-muted">Tests · runs all .test.ts files</span>
              <span className="text-muted">click ▶ Run below</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <SandpackTests watchMode={false} onComplete={onTestComplete} />
            </div>
            {/* Run only makes sense from a test file — grey the panel otherwise. */}
            {!testFileActive && (
              <div className="absolute inset-0 top-7 flex items-center justify-center bg-surface/80 backdrop-blur-[1px]">
                <p className="mx-6 text-center text-sm text-muted">
                  Open a <code className="font-mono">.test.ts</code> file to run tests.
                </p>
              </div>
            )}
          </div>
          <div
            data-tour="console"
            className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5 text-xs">
              <span className="font-medium text-muted">
                Output · runs <code className="font-mono">index.ts</code> live
              </span>
              <button
                onClick={() => sandpack.runSandpack()}
                className="rounded-md border border-border px-2 py-0.5 font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                title="Re-run index.ts now"
              >
                ↻ Re-run
              </button>
            </div>
            {/* Bump the console text to 15px (Sandpack defaults to 13px) so it
                reads at least as large as the code editor. */}
            <div className="min-h-0 flex-1 overflow-auto [&_*]:!text-[15px]">
              <SandpackConsole standalone resetOnPreviewRestart onLogsChange={handleLogs} />
            </div>
          </div>
        </div>
      </div>

      <aside className="flex w-80 flex-col gap-3">
        <div
          data-tour="timer"
          className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Time left
            </span>
            <button
              onClick={startTour}
              className="rounded-full border border-border px-2 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
              aria-label="Replay the walkthrough"
              title="How does this work?"
            >
              ?
            </button>
          </div>
          {timerNode}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex border-b border-border text-sm">
            <button
              onClick={() => setTab("prompt")}
              className={`flex-1 border-b-2 px-3 py-2 transition-colors ${tab === "prompt" ? "border-accent font-semibold text-foreground" : "border-transparent text-muted"}`}
            >
              Task
            </button>
            <button
              data-tour="agent-note"
              onClick={() => setTab("agent")}
              className={`flex-1 border-b-2 px-3 py-2 transition-colors ${tab === "agent" ? "border-accent font-semibold text-foreground" : "border-transparent text-muted"}`}
            >
              Agent note
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3">
            <Markdown>{tab === "prompt" ? prompt : agentNote}</Markdown>
          </div>
        </div>

        <div data-tour="mark-ready">{actionNode}</div>
      </aside>
      </div>
    </div>
  );
}

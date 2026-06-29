"use client";

// Wires Sandpack's internal state to the trace recorder: which file is open,
// edits (debounced full-file snapshots), and a cheap "test added" heuristic.
// Test execution is recorded separately, from SandpackTests' onComplete.

import { useEffect, useRef } from "react";
import { useSandpack } from "@codesandbox/sandpack-react";

import type { TraceRecorder } from "@/lib/trace";

const EDIT_DEBOUNCE_MS = 1000;
const TEST_DECL = /\b(it|test)\s*\(/g;

function countTests(src: string): number {
  return (src.match(TEST_DECL) ?? []).length;
}

// Only candidate files live under src/; ignore template scaffolding.
function candidateFiles(files: Record<string, { code: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, file] of Object.entries(files)) {
    if (path.startsWith("/src/") || path.startsWith("src/")) out[path] = file.code;
  }
  return out;
}

// recorder is null on the warm-up screen (same UI, but nothing is recorded).
export function useTraceBridge(recorder: TraceRecorder | null): void {
  const { sandpack } = useSandpack();
  const { activeFile, files } = sandpack;

  const lastOpened = useRef<string | null>(null);
  useEffect(() => {
    if (recorder && activeFile && activeFile !== lastOpened.current) {
      lastOpened.current = activeFile;
      recorder.record("file_opened", { path: activeFile });
    }
  }, [activeFile, recorder]);

  const lastContent = useRef<Record<string, string>>({});
  const initialized = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapshot = candidateFiles(files);
  const key = JSON.stringify(snapshot);

  useEffect(() => {
    if (!recorder) return;
    if (!initialized.current) {
      lastContent.current = snapshot;
      initialized.current = true;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      for (const [path, code] of Object.entries(snapshot)) {
        if (lastContent.current[path] === code) continue;
        // The test file is a distinct signal — record it as test_edited (not
        // file_edited), plus the cheap "test added" count heuristic.
        if (path.endsWith(".test.ts")) {
          recorder.record("test_edited", { path, content: code });
          const added = countTests(code) - countTests(lastContent.current[path] ?? "");
          if (added > 0) recorder.record("test_added", { path });
        } else {
          recorder.record("file_edited", { path, content: code });
        }
        lastContent.current[path] = code;
      }
    }, EDIT_DEBOUNCE_MS);
    // key captures the full snapshot; snapshot/recorder are derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

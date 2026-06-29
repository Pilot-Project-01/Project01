// Pure parsing/shaping helpers for the trace layer, extracted from the
// Sandpack-bound components so they can be unit-tested without a browser.

import type { TestResult } from "@/types/trace";

// Cap verbatim scratchpad output so a runaway loop can't bloat the trace.
export const OUTPUT_CAP = 8 * 1024;

export interface TestTally {
  passed: number;
  failed: number;
  tests: TestResult[];
}

// Walk the SandpackTests result tree, tallying pass/fail and collecting which
// individual tests ran (with their outcome), regardless of nesting.
export function tallyTests(node: unknown, acc?: TestTally): TestTally {
  acc ??= { passed: 0, failed: 0, tests: [] };
  if (!node || typeof node !== "object") return acc;
  const obj = node as Record<string, unknown>;
  if (obj.status === "pass" || obj.status === "fail") {
    if (obj.status === "pass") acc.passed += 1;
    else acc.failed += 1;
    acc.tests.push({
      name: typeof obj.name === "string" ? obj.name : "(unnamed)",
      status: obj.status,
    });
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") tallyTests(value, acc);
  }
  return acc;
}

// Flatten Sandpack console entries into verbatim output text: one line per
// console call, args within a call joined by a space.
export function joinLogs(logs: Array<{ data?: unknown[] }>): string {
  return logs
    .map((l) =>
      (l.data ?? [])
        .map((d) => (typeof d === "string" ? d : JSON.stringify(d)))
        .join(" "),
    )
    .join("\n");
}

// Cap output to OUTPUT_CAP, reporting whether it was truncated.
export function capOutput(output: string): { output: string; truncated: boolean } {
  const truncated = output.length > OUTPUT_CAP;
  return { output: truncated ? output.slice(0, OUTPUT_CAP) : output, truncated };
}

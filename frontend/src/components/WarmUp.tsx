"use client";

import { SandpackProvider } from "@codesandbox/sandpack-react";

import { WorkspaceShell } from "@/components/WorkspaceShell";
import { useWorkspaceTour } from "@/components/useWorkspaceTour";

// Throwaway example task. Same layout as the real assessment so the candidate
// learns the interface here — but the clock does NOT run and nothing is
// recorded. The walkthrough auto-runs on this screen.
const WARMUP_FILES = {
  // index.ts is the entry Sandpack runs; we make it a live scratchpad whose
  // console output shows in the Output panel.
  "/index.ts": {
    code: `// Scratchpad — runs live in the Output panel on the right.
import { greet } from "./src/greet";

console.log(greet("World"));
`,
  },
  "/src/greet.ts": {
    code: `export function greet(name: string): string {\n  return "Hello, " + name + "!";\n}\n`,
    active: true,
  },
  "/src/greet.test.ts": {
    code: `import { greet } from "./greet";

// A test checks that code does what you expect. Open the Tests panel on the
// right and click "Run" to execute these.
describe("greet", () => {
  it("greets by name", () => {
    expect(greet("Ada")).toBe("Hello, Ada!");
  });

  // Add your own. Try changing the expected value to something WRONG, run it,
  // and watch the test fail — that's how you'll catch the agent's mistakes.
  it("greets a different name", () => {
    expect(greet("Sam")).toBe("Hello, Sam!");
  });
});
`,
  },
};

const WARMUP_PROMPT = `# Warm-up (untimed)

This is a practice round to learn the workspace. Nothing here is timed, recorded, or scored.

- Edit \`src/greet.ts\` on the left.
- The **Output** panel (bottom-right) runs \`index.ts\` live — edit it to try the code and watch the output update.
- Open the \`greet.test.ts\` tab, then click the **▶ Run** button **in the Tests panel** (bottom-left) to run the tests.
- Read the **Agent note** tab to see what the assistant claims.

When you're comfortable, click **Start the assessment**.`;

const WARMUP_AGENT_NOTE = `## From your AI assistant (example)

I added a \`greet\` function and a test. Everything looks good and is ready to ship. ✅

*(In the real task, treat claims like this with healthy skepticism — verify before you trust.)*`;

interface WarmUpProps {
  onStart: () => void;
  // Auto-run the walkthrough? False when the candidate has come BACK to the
  // warm-up (they've already seen it). The ? button always replays it.
  autoTour?: boolean;
}

export function WarmUp({ onStart, autoTour = true }: WarmUpProps) {
  return (
    <SandpackProvider
      template="vanilla-ts"
      files={WARMUP_FILES}
      options={{ initMode: "immediate" }}
      theme="auto"
    >
      <WarmUpInner onStart={onStart} autoTour={autoTour} />
    </SandpackProvider>
  );
}

function WarmUpInner({ onStart, autoTour = true }: WarmUpProps) {
  const { startTour } = useWorkspaceTour(autoTour);

  return (
    <WorkspaceShell
      banner={
        <div className="flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-sm font-semibold uppercase tracking-wide text-accent-foreground">
          Warm-up — practice round · untimed, nothing here is recorded or scored
        </div>
      }
      prompt={WARMUP_PROMPT}
      agentNote={WARMUP_AGENT_NOTE}
      readOnly={false}
      startTour={startTour}
      timerNode={
        <span
          className="font-mono text-2xl tabular-nums text-muted"
          title="The clock starts when you click Start the assessment"
        >
          10:00
        </span>
      }
      actionNode={
        <button
          onClick={onStart}
          className="w-full rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Start the assessment
        </button>
      }
    />
  );
}

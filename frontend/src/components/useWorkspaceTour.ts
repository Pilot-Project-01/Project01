"use client";

// A skippable next/next walkthrough of the workspace, built on driver.js.
// Auto-runs once per browser (localStorage flag); a Help button can replay it.

import { useCallback, useEffect } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const STEPS: DriveStep[] = [
  {
    element: "[data-tour='editor']",
    popover: {
      title: "The code",
      description:
        "The AI agent already wrote this. Read it critically — your job is to decide whether it's actually ready to ship.",
    },
  },
  {
    element: "[data-tour='tests']",
    popover: {
      title: "Run the tests here",
      description:
        "This is the only place tests run. Open a <b>.test.ts</b> file (use the editor tabs), then click the <b>▶ Run</b> button <b>in this panel</b> to execute them and see pass/fail. Two toggles: <b>Verbose</b> shows each individual assertion instead of just a summary; <b>Watch</b> re-runs tests automatically on every edit (leave it off to run manually). You can add your own tests too.",
    },
  },
  {
    element: "[data-tour='console']",
    popover: {
      title: "Output — run the code",
      description:
        "This panel runs <b>index.ts</b> <b>live</b> — edit it to call the code with real inputs (e.g. a realistic price) and the <b>console.log</b> output updates here automatically. Use <b>↻ Re-run</b> to force a re-run. It's the fastest way to see what the code actually does, not just what the agent claims.",
    },
  },
  {
    element: "[data-tour='agent-note']",
    popover: {
      title: "The agent's note",
      description:
        "Switch to “Agent note” to read what the agent claims it did. Claims are not guarantees — verify before you trust.",
    },
  },
  {
    element: "[data-tour='timer']",
    popover: {
      title: "10 minutes",
      description: "The clock is running. Work at a realistic pace.",
    },
  },
  {
    element: "[data-tour='mark-ready']",
    popover: {
      title: "Commit your decision",
      description:
        "In the real task this is “Mark ready to ship” — clicking it locks in your call, which is the point of the exercise. For now, click Start the assessment when you're ready to begin.",
    },
  },
];

function makeDriver() {
  return driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Got it",
    steps: STEPS,
  });
}

export function useWorkspaceTour(autoRun: boolean): { startTour: () => void } {
  const startTour = useCallback(() => {
    makeDriver().drive();
  }, []);

  // Auto-run on the warm-up screen. The warm-up loads once per candidate, so we
  // show it every time the screen mounts (no localStorage guard — that's why it
  // previously "stopped appearing" after the first run). The ? button replays it.
  useEffect(() => {
    if (!autoRun || typeof window === "undefined") return;
    // Wait until the tour's anchor elements actually exist before driving —
    // Sandpack mounts its panels asynchronously, so poll briefly for them.
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (document.querySelector("[data-tour='editor']")) {
        clearInterval(id);
        makeDriver().drive();
      } else if (tries > 20) {
        clearInterval(id); // give up after ~5s; user can still use the ? button
      }
    }, 250);
    return () => clearInterval(id);
  }, [autoRun]);

  return { startTour };
}

import { describe, expect, it } from "vitest";

import { OUTPUT_CAP, capOutput, joinLogs, tallyTests } from "@/lib/trace-parse";

describe("tallyTests", () => {
  it("walks a nested spec tree, tallying and naming each test", () => {
    // Shape mirrors SandpackTests' onComplete result: describe blocks nesting specs.
    const tree = {
      describes: {
        applyDiscount: {
          tests: {
            t1: { name: "applies 10%", status: "pass" },
            t2: { name: "rejects bad code", status: "fail" },
          },
        },
      },
    };
    const r = tallyTests(tree);
    expect(r.passed).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.tests).toEqual([
      { name: "applies 10%", status: "pass" },
      { name: "rejects bad code", status: "fail" },
    ]);
  });

  it("returns an empty tally for null / non-objects", () => {
    expect(tallyTests(null)).toEqual({ passed: 0, failed: 0, tests: [] });
    expect(tallyTests("nope")).toEqual({ passed: 0, failed: 0, tests: [] });
  });

  it("falls back to (unnamed) when a spec has no name", () => {
    const r = tallyTests({ status: "pass" });
    expect(r.tests).toEqual([{ name: "(unnamed)", status: "pass" }]);
  });
});

describe("joinLogs", () => {
  it("joins args with a space and console calls with newlines", () => {
    expect(joinLogs([{ data: ["SAVE10 ->", "17.99"] }, { data: ["done"] }])).toBe(
      "SAVE10 -> 17.99\ndone",
    );
  });

  it("JSON-stringifies non-string args", () => {
    expect(joinLogs([{ data: [{ a: 1 }, 2] }])).toBe('{"a":1} 2');
  });

  it("tolerates entries without data", () => {
    expect(joinLogs([{}, { data: ["x"] }])).toBe("\nx");
  });
});

describe("capOutput", () => {
  it("passes short output through untruncated", () => {
    expect(capOutput("hello")).toEqual({ output: "hello", truncated: false });
  });

  it("truncates output longer than the cap", () => {
    const r = capOutput("x".repeat(OUTPUT_CAP + 100));
    expect(r.truncated).toBe(true);
    expect(r.output.length).toBe(OUTPUT_CAP);
  });

  it("does not truncate output exactly at the cap (boundary)", () => {
    const r = capOutput("x".repeat(OUTPUT_CAP));
    expect(r.truncated).toBe(false);
    expect(r.output.length).toBe(OUTPUT_CAP);
  });
});

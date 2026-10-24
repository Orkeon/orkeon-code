// /dev-implement's arguments and its chain in `completed` (src/commands/_lib/dev-implement.ts). Run:
//   node --test tests/commands-dev-implement.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { chainStep, DEV_IMPLEMENT_USAGE, parseDevImplementArgs } from "../src/commands/_lib/dev-implement.ts";

describe("parseDevImplementArgs", () => {
  it("reads the batch, the plan and the close", () => {
    deepStrictEqual(parseDevImplementArgs(["F2", "prune"]), { ok: true, args: { batch: "F2", plan: "prune", close: false, pr: false, correction: null } });
    deepStrictEqual(parseDevImplementArgs(["F2", "workbench/prune/PRUNE-PLAN.md", "--close", "--pr"]),
      { ok: true, args: { batch: "F2", plan: "workbench/prune/PRUNE-PLAN.md", close: true, pr: true, correction: null } });
  });

  it("refuses no batch, a bad one, two plans, an unknown option, and --pr without --close", () => {
    deepStrictEqual(parseDevImplementArgs([]), { ok: false, text: DEV_IMPLEMENT_USAGE });
    strictEqual(parseDevImplementArgs(["2"]).ok, false);
    strictEqual(parseDevImplementArgs(["F1", "a", "b"]).ok, false);
    strictEqual(parseDevImplementArgs(["F1", "--fast"]).ok, false);
    strictEqual(parseDevImplementArgs(["F1", "--pr"]).ok, false);
    strictEqual(parseDevImplementArgs(["F1", "../x/X-PLAN.md"]).ok, false);
  });

  it("reads a correction's finding, after the dash or the word alone, the plan before it", () => {
    deepStrictEqual(parseDevImplementArgs(["F1", "—", "correction:", "Major", "Reuse:", "a", "copy"]),
      { ok: true, args: { batch: "F1", plan: null, close: false, pr: false, correction: "Major Reuse: a copy" } });
    deepStrictEqual(parseDevImplementArgs(["F1", "demo", "correction:Blocking", "Test:", "x"]),
      { ok: true, args: { batch: "F1", plan: "demo", close: false, pr: false, correction: "Blocking Test: x" } });
    deepStrictEqual(parseDevImplementArgs(["F1", "correction"]),
      { ok: true, args: { batch: "F1", plan: "correction", close: false, pr: false, correction: null } });
  });

  it("refuses a correction without its finding, or with --close", () => {
    const empty = parseDevImplementArgs(["F1", "—", "correction:"]);
    ok(!empty.ok && empty.text.includes("names its finding"));
    strictEqual(parseDevImplementArgs(["F1", "--close", "—", "correction:", "x"]).ok, false);
  });
});

describe("chainStep", () => {
  it("prints the crew's lines and launches the audit it names", () => {
    const step = chainStep(JSON.stringify({ lines: ["a", "b"], next: { crew: "dev-verify", input: { batch: "F1", plan: "demo" } } }));
    deepStrictEqual(step, { lines: ["a", "b"], launch: { crew: "dev-verify", input: { batch: "F1", plan: "demo" }, instead: "/dev-verify F1 demo" } });
    deepStrictEqual(chainStep(JSON.stringify({ lines: ["BLOCKED — x"] })), { lines: ["BLOCKED — x"] });
  });

  it("carries the input the crew wrote to the audit: its mode, the hooks, the effort", () => {
    const input = { batch: "F1", plan: "demo", mode: "resume", hooks: [{ event: "pre" }], effort: "high" };
    const step = chainStep(JSON.stringify({ lines: [], next: { crew: "dev-verify", input } }));
    deepStrictEqual(step.launch, { crew: "dev-verify", input, instead: "/dev-verify F1 demo resume" });
  });

  it("launches the close on the audit's VALID line, its plan read off the verdict file", () => {
    const text = "GATE — batch F1: GREEN\nwritten: workbench/demo/DEMO-VERIFY-F1.md — capture: workbench/demo/capture-F1/\n→ Batch F1 VALID. commit…";
    const step = chainStep(text);
    deepStrictEqual(step.launch, {
      crew: "dev-implement", input: { batch: "F1", plan: "workbench/demo/DEMO-PLAN.md", close: true },
      instead: "/dev-implement F1 workbench/demo/DEMO-PLAN.md --close",
    });
  });

  it("launches nothing on GAPS, and prints the audit's text as is", () => {
    const text = "written: workbench/demo/DEMO-VERIFY-F1.md — capture: x/\n→ /dev-implement F1 — correction: Major Reuse: y";
    deepStrictEqual(chainStep(text), { lines: text.split("\n") });
  });
});

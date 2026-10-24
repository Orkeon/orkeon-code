// /dev-implement's arguments and its chain in `completed` (src/commands/_lib/dev-implement.ts). Run:
//   node --test tests/commands-dev-implement.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { chainStep, DEV_IMPLEMENT_USAGE, parseDevImplementArgs } from "../src/commands/_lib/dev-implement.ts";

describe("parseDevImplementArgs", () => {
  it("reads the batch, the plan and the close", () => {
    deepStrictEqual(parseDevImplementArgs(["F2", "prune"]), { ok: true, args: { batch: "F2", plan: "prune", close: false, pr: false } });
    deepStrictEqual(parseDevImplementArgs(["F2", "workbench/prune/PRUNE-PLAN.md", "--close", "--pr"]),
      { ok: true, args: { batch: "F2", plan: "workbench/prune/PRUNE-PLAN.md", close: true, pr: true } });
  });

  it("refuses no batch, a bad one, two plans, an unknown option, and --pr without --close", () => {
    deepStrictEqual(parseDevImplementArgs([]), { ok: false, text: DEV_IMPLEMENT_USAGE });
    strictEqual(parseDevImplementArgs(["2"]).ok, false);
    strictEqual(parseDevImplementArgs(["F1", "a", "b"]).ok, false);
    strictEqual(parseDevImplementArgs(["F1", "--fast"]).ok, false);
    strictEqual(parseDevImplementArgs(["F1", "--pr"]).ok, false);
    strictEqual(parseDevImplementArgs(["F1", "../x/X-PLAN.md"]).ok, false);
  });

  it("refuses a correction with the line to type in the harness", () => {
    const r = parseDevImplementArgs(["F1", "—", "correction:", "Major", "Reuse"]);
    ok(!r.ok && r.text.includes("not run by Orkeon Code yet"));
  });
});

describe("chainStep", () => {
  it("prints the crew's lines and launches the audit it names", () => {
    const step = chainStep(JSON.stringify({ lines: ["a", "b"], next: { crew: "dev-verify", input: { batch: "F1", plan: "demo" } } }));
    deepStrictEqual(step, { lines: ["a", "b"], launch: { crew: "dev-verify", input: { batch: "F1", plan: "demo" }, instead: "/dev-verify F1 demo" } });
    deepStrictEqual(chainStep(JSON.stringify({ lines: ["BLOCKED — x"] })), { lines: ["BLOCKED — x"] });
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

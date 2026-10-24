// /dev-batches' arguments and its chain in `completed` (src/commands/_lib/dev-batches.ts): each answer
// told apart by the crew that gave it. Run:
//   node --test tests/commands-dev-batches.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { DEV_BATCHES_USAGE, batchesChainStep, parseDevBatchesArgs } from "../src/commands/_lib/dev-batches.ts";

describe("parseDevBatchesArgs", () => {
  it("reads a code and --pr, or nothing", () => {
    deepStrictEqual(parseDevBatchesArgs([]), { ok: true, args: { code: null, pr: false } });
    deepStrictEqual(parseDevBatchesArgs(["demo", "--pr"]), { ok: true, args: { code: "demo", pr: true } });
  });

  it("refuses two codes, a path, an unknown option, and answers --help with the usage", () => {
    strictEqual(parseDevBatchesArgs(["a", "b"]).ok, false);
    strictEqual(parseDevBatchesArgs(["../x"]).ok, false);
    strictEqual(parseDevBatchesArgs(["--fast"]).ok, false);
    deepStrictEqual(parseDevBatchesArgs(["--help"]), { ok: false, text: DEV_BATCHES_USAGE });
  });

  it("accepts --concurrency 1 (both spellings) as the sequential run, and refuses above 1 in one line naming the follow-up issue", () => {
    for (const tokens of [["demo", "--concurrency", "1"], ["--concurrency=1", "demo"]]) {
      deepStrictEqual(parseDevBatchesArgs(tokens), { ok: true, args: { code: "demo", pr: false } });
    }
    deepStrictEqual(parseDevBatchesArgs(["demo", "--concurrency", "2"]), {
      ok: false,
      text: 'dev-batches: concurrency 2 refused: parallel runs wait for a runtime working root for script agents (follow-up issue "working root for script agents"); run with concurrency 1',
    });
    for (const tokens of [["--concurrency"], ["--concurrency", "0"], ["--concurrency=x"]]) strictEqual(parseDevBatchesArgs(tokens).ok, false);
  });
});

describe("batchesChainStep", () => {
  it("launches the batch the dev-batches crew names", () => {
    const input = { batch: "F2", plan: "demo", effort: "high" };
    deepStrictEqual(batchesChainStep("dev-batches", JSON.stringify({ lines: ["→ F2 launched"], next: { crew: "dev-implement", input } })),
      { lines: ["→ F2 launched"], launch: { crew: "dev-implement", input, instead: "/dev-implement F2 demo" } });
    deepStrictEqual(batchesChainStep("dev-batches", JSON.stringify({ lines: ["BLOCKED — x"] })), { lines: ["BLOCKED — x"] });
  });

  it("launches the audit /dev-implement names, as its own chain does", () => {
    const step = batchesChainStep("dev-implement", JSON.stringify({ lines: ["a"], next: { crew: "dev-verify", input: { batch: "F2", plan: "demo" } } }));
    strictEqual(step.launch?.crew, "dev-verify");
  });

  it("closes a VALID batch without pushing it", () => {
    const text = "written: workbench/demo/DEMO-VERIFY-F2.md — capture: x/\n→ Batch F2 VALID. commit…";
    deepStrictEqual(batchesChainStep("dev-verify", text).launch, {
      crew: "dev-implement", input: { batch: "F2", plan: "workbench/demo/DEMO-PLAN.md", close: true, push: false },
      instead: "/dev-implement F2 workbench/demo/DEMO-PLAN.md --close",
    });
  });

  it("hands an answer that launches nothing back to the crew, its last lines with it", () => {
    const text = "written: workbench/demo/DEMO-VERIFY-F2.md — capture: x/\n\n→ /dev-implement F2 — correction: Major y";
    deepStrictEqual(batchesChainStep("dev-verify", text).launch, {
      crew: "dev-batches", input: { after: ["written: workbench/demo/DEMO-VERIFY-F2.md — capture: x/", "→ /dev-implement F2 — correction: Major y"] },
      instead: "/dev-batches",
    });
    const many = JSON.stringify({ lines: Array.from({ length: 30 }, (_, i) => `l${i}`) });
    strictEqual((batchesChainStep("dev-implement", many).launch?.input.after as string[]).length, 20);
  });

  it("prints an answer of another crew as is", () => {
    deepStrictEqual(batchesChainStep("other", "a\nb"), { lines: ["a", "b"] });
  });
});

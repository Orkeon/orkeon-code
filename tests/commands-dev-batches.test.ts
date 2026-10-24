// /dev-batches' arguments and its chain in `completed` (src/commands/_lib/dev-batches.ts): each answer
// told apart by the crew that gave it. Run:
//   node --test tests/commands-dev-batches.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  DEV_BATCHES_USAGE, batchesChainStep, batchesLaunchInput, batchesModeRefusal, parseDevBatchesArgs,
} from "../src/commands/_lib/dev-batches.ts";

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

  it("keeps a typed --concurrency 1 (both spellings), which goes back to one at a time; none typed: no key", () => {
    for (const tokens of [["demo", "--concurrency", "1"], ["--concurrency=1", "demo"]]) {
      deepStrictEqual(parseDevBatchesArgs(tokens), { ok: true, args: { code: "demo", pr: false, concurrency: 1 } });
    }
    deepStrictEqual(parseDevBatchesArgs(["demo"]), { ok: true, args: { code: "demo", pr: false } });
  });

  it("accepts 2 to 4 batches at once, and refuses above 4 or a bad value in one line", () => {
    deepStrictEqual(parseDevBatchesArgs(["demo", "--concurrency", "2"]), { ok: true, args: { code: "demo", pr: false, concurrency: 2 } });
    deepStrictEqual(parseDevBatchesArgs(["--concurrency=4"]), { ok: true, args: { code: null, pr: false, concurrency: 4 } });
    deepStrictEqual(parseDevBatchesArgs(["demo", "--concurrency", "5"]), { ok: false, text: "dev-batches: concurrency 5 refused: at most 4 batches at once" });
    for (const tokens of [["--concurrency"], ["--concurrency", "0"], ["--concurrency=x"]]) strictEqual(parseDevBatchesArgs(tokens).ok, false);
  });
});

describe("batchesLaunchInput", () => {
  const read = { ruleSets: ["git-readonly"], effort: "high", permissionMode: "bypassPermissions", permissionRules: [], githubTool: true };
  const today = { code: "demo", pr: false, ...read };

  it("is today's input without the option: no concurrency key; a typed 1 is carried, to override the run in progress", () => {
    const bare = parseDevBatchesArgs(["demo"]);
    deepStrictEqual(bare.ok && batchesLaunchInput(bare.args, read), today);
    const one = parseDevBatchesArgs(["demo", "--concurrency", "1"]);
    deepStrictEqual(one.ok && batchesLaunchInput(one.args, read), { ...today, concurrency: 1 });
  });

  it("carries the concurrency above 1", () => {
    const parsed = parseDevBatchesArgs(["demo", "--concurrency", "3"]);
    deepStrictEqual(parsed.ok && batchesLaunchInput(parsed.args, read), { ...today, concurrency: 3 });
  });
});

describe("batchesModeRefusal", () => {
  it("refuses above 1 in a mode that asks before shell commands, before any launch", () => {
    strictEqual(batchesModeRefusal({ code: "demo", pr: false, concurrency: 2 }, "acceptEdits"),
      "dev-batches: concurrency 2 refused: the session mode acceptEdits asks before shell commands, and two batches would ask at once: /mode bypassPermissions, or run with --concurrency 1");
    strictEqual(batchesModeRefusal({ code: "demo", pr: false, concurrency: 2 }, "bypassPermissions"), null);
    strictEqual(batchesModeRefusal({ code: "demo", pr: false }, "default"), null);
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

  it("launches the next wave the dev-batches crew names: the crew again, its input as given", () => {
    const input = { after: ["✓ F2 merged"], concurrency: 2 };
    deepStrictEqual(batchesChainStep("dev-batches", JSON.stringify({ lines: ["✓ F2 merged"], next: { crew: "dev-batches", input } })),
      { lines: ["✓ F2 merged"], launch: { crew: "dev-batches", input, instead: "/dev-batches --concurrency 2" } });
  });

  it("prints an answer of another crew as is", () => {
    deepStrictEqual(batchesChainStep("other", "a\nb"), { lines: ["a", "b"] });
  });
});

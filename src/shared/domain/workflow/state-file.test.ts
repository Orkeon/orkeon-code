// The state file of a dev batch and the session's pointer to it. Run:
//   node --test src/shared/domain/workflow/state-file.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MAX_EVENT_LINES, MAX_STATE_LINE_CHARS, MAX_TREE_LINES, batchesStatePath, boundLine, firstOpenStep, formatActiveWorkflow, parseActiveWorkflow, renderStateFile,
  sheetStateSteps, stateFilePath,
} from "./state-file.ts";
import type { StateFacts } from "./state-file.ts";
import { parseBatchSheet } from "../dev/plan-format.ts";

const F2 = readFileSync(fileURLToPath(new URL("../../../../tests/fixtures/dev/workbench/demo/DEMO-PLAN-F2.md", import.meta.url)), "utf-8");

describe("the pointer to the batch in progress", () => {
  it("round-trips a code and a phase, and keeps a phase without a code", () => {
    strictEqual(parseActiveWorkflow(formatActiveWorkflow({ code: "demo", phase: "F2" }))?.code, "demo");
    deepStrictEqual(parseActiveWorkflow(`{"code":null,"phase":"F3"}`), { code: null, phase: "F3" });
    deepStrictEqual(parseActiveWorkflow(`{"code":"../x","phase":"F3"}`), { code: null, phase: "F3" });
  });

  it("reads nothing from an absent, blank or malformed value", () => {
    for (const v of [null, "", "{", "[]", `{"phase":"2"}`, `{"code":"demo"}`]) strictEqual(parseActiveWorkflow(v), null, String(v));
  });

  it("names the files under Code's state folder", () => {
    strictEqual(stateFilePath("demo", "F2"), ".orkeon/dev/demo/state-F2.md");
    strictEqual(batchesStatePath("demo"), ".orkeon/dev/demo/batches-state.md");
  });
});

describe("the steps of a sheet", () => {
  it("keeps the steps with a TDD line and finds the first open one", () => {
    const steps = sheetStateSteps(parseBatchSheet(F2));
    deepStrictEqual(steps.map((s) => [s.label, s.tdd, s.open]), [
      ["Step 1 — Print the batches of a plan with their state", "RED [x] GREEN [ ] COST [ ]", true],
      ["Step 2 — Refuse a code that is not a plain folder name", "RED [ ] GREEN [ ] COST [ ]", true],
    ]);
    strictEqual(firstOpenStep(steps), "Step 1 — Print the batches of a plan with their state");
    strictEqual(firstOpenStep(steps.map((s) => ({ ...s, open: false }))), null);
  });
});

describe("renderStateFile", () => {
  const facts: StateFacts = {
    code: "demo", phase: "F2", at: "2026-10-24T10:00:00Z", trigger: "manual", sheet: "workbench/demo/DEMO-PLAN-F2.md",
    steps: sheetStateSteps(parseBatchSheet(F2)),
    events: ["- 2026-10-21 08:30 F2 launched"],
    reports: ["F2-audit.md"],
    tree: { lines: [" M src/a.ts"] },
  };

  it("writes the header, the steps, the first open step, the events, the reports and the tree", () => {
    const text = renderStateFile(facts);
    ok(text.startsWith("# State of batch F2 of demo — written at 2026-10-24T10:00:00Z before a manual compaction\n"));
    ok(text.includes("`workbench/demo/DEMO-PLAN-F2.md`"));
    ok(text.includes("- Step 2 — Refuse a code that is not a plain folder name: RED [ ] GREEN [ ] COST [ ]\n"));
    ok(text.includes("\nFirst open: Step 1 — Print the batches of a plan with their state\n"));
    ok(text.includes("## Events of F2 in `.orkeon/dev/demo/batches-state.md`\n\n- 2026-10-21 08:30 F2 launched\n"));
    ok(text.includes("## Reports recorded for F2\n\n- F2-audit.md\n"));
    ok(text.includes("```text\n M src/a.ts\n```\n"));
  });

  it("says when nothing is open, nothing happened, and the tree is clean", () => {
    const text = renderStateFile({ ...facts, steps: [], events: [], reports: [], tree: { lines: [] } });
    ok(text.includes("(the sheet has no step with a TDD line)"));
    ok(text.includes("No open step: every TDD line is ticked."));
    ok(text.includes("```text\n(clean)\n```"));
    strictEqual(text.match(/\(none\)/g)?.length, 2);
  });

  it("cuts the tree, saying so, and carries why git gave none", () => {
    const many = Array.from({ length: MAX_TREE_LINES + 2 }, (_, i) => `?? f${i}`);
    const text = renderStateFile({ ...facts, tree: { lines: many } });
    ok(text.includes(`?? f${MAX_TREE_LINES - 1}\n\`\`\`\n(2 more line(s) left out)`));
    ok(!text.includes(`?? f${MAX_TREE_LINES}\n`));
    ok(renderStateFile({ ...facts, tree: { note: "git status failed: fatal" } }).includes("(git status failed: fatal)"));
  });

  it("bounds a long step title, a long event line and the number of events", () => {
    const long = "x".repeat(400);
    const steps = [{ label: boundLine(`Step 1 — ${long}`), tdd: "RED [ ] GREEN [ ] COST [ ]", open: true }];
    strictEqual(steps[0].label.length, MAX_STATE_LINE_CHARS);
    const events = Array.from({ length: MAX_EVENT_LINES + 5 }, (_, i) => `- 2026-10-24 09:00 F2 launched ${i}${i === MAX_EVENT_LINES + 4 ? long : ""}`);
    const text = renderStateFile({ ...facts, steps, events });
    ok(text.includes("(5 earlier line(s) left out)"));
    ok(!text.includes("F2 launched 4\n") && text.includes("F2 launched 5\n"));
    ok(text.split("\n").every((l) => l.length <= MAX_STATE_LINE_CHARS + 40), "no line runs unbounded");
  });
});

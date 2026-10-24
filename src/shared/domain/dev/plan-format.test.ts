// Global plan and batch sheet parsers, over the demo work folder. Run:
//   node --test src/shared/domain/dev/plan-format.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { parseGlobalPlan, parseBatchSheet, sheetProgress } from "./plan-format.ts";

const fixture = (name: string): string =>
  readFileSync(new URL(`../../../../tests/fixtures/dev/workbench/demo/${name}`, import.meta.url), "utf8");

describe("parseGlobalPlan over DEMO-PLAN.md", () => {
  const plan = parseGlobalPlan(fixture("DEMO-PLAN.md"));

  it("reads the title", () => {
    strictEqual(plan.prefix, "DEMO");
    strictEqual(plan.feature, "Demo feature");
    deepStrictEqual(plan.problems, []);
  });

  it("reads the summary rows and their dependencies", () => {
    deepStrictEqual(plan.summary.map((r) => [r.id, r.dependsOn]), [["F1", []], ["F2", ["F1"]], ["F3", []]]);
    strictEqual(plan.summary[0].ids, "artefacts, plan-format");
    strictEqual(plan.summary[1].reason, "the command prints what the parsers return");
  });

  it("reads each batch, its state and its boxes", () => {
    deepStrictEqual(plan.batches.map((b) => [b.id, b.name, b.state]), [
      ["F1", "Parsers", { kind: "done", date: "2026-10-20" }],
      ["F2", "Command", { kind: "open" }],
      ["F3", "Docs", { kind: "open" }],
    ]);
    deepStrictEqual(plan.batches.map((b) => b.steps.map((s) => s.done)),
      [[true, true, true], [true, false, false], [false, false]]);
    strictEqual(plan.batches[1].steps[1].text, "Refuse a code that is not a plain folder name");
    strictEqual(plan.batches[1].steps[1].number, 2);
    strictEqual(plan.batches[0].line, 13);
  });
});

describe("parseGlobalPlan inline", () => {
  it("keeps a name that holds ' — ' whole", () => {
    const plan = parseGlobalPlan("### Batch F1 — Read — then write — open\n- [X] 1. one\n");
    deepStrictEqual(plan.batches.map((b) => [b.name, b.state, b.steps[0].done]), [["Read — then write", { kind: "open" }, true]]);
  });

  it("gives an unknown state as other, with a problem", () => {
    const plan = parseGlobalPlan("# X-PLAN — Y\n\n### Batch F4 — X — in progress\n- [ ] 1. a\n");
    deepStrictEqual(plan.batches.map((b) => [b.id, b.name, b.state, b.steps.length]),
      [["F4", "X", { kind: "other", text: "in progress" }, 1]]);
    deepStrictEqual(plan.problems, [{ line: 3, message: "unknown batch line '### Batch F4 — X — in progress'" }]);
  });

  it("reports a batch line without a state", () => {
    const plan = parseGlobalPlan("### Batch F5 — Name\n");
    deepStrictEqual(plan.problems, [{ line: 1, message: "unknown batch line '### Batch F5 — Name'" }]);
  });

  it("skips fenced lines", () => {
    const plan = parseGlobalPlan("```markdown\n### Batch F1 — A — open\n```\n");
    deepStrictEqual(plan.batches, []);
  });

  it("keeps a four-backtick fence open over a three-backtick line", () => {
    const plan = parseGlobalPlan("````\n```\n### Batch F9 — Fake — open\n```\n````\n### Batch F1 — A — open\n");
    deepStrictEqual(plan.batches.map((b) => b.id), ["F1"]);
  });
});

describe("parseBatchSheet over the demo sheets", () => {
  it("F1: done title, no dependency, two ticked behaviour steps and a Done line", () => {
    const s = parseBatchSheet(fixture("DEMO-PLAN-F1.md"));
    deepStrictEqual([s.prefix, s.batch, s.name, s.doneDate, s.dependsOn], ["DEMO", "F1", "Parsers", "2026-10-20", []]);
    deepStrictEqual(s.steps.map((st) => [st.number, st.title, st.tdd && [st.tdd.red, st.tdd.green, st.tdd.cost]]), [
      [1, "Recognise each artefact by its file name", [true, true, true]],
      [2, "Turn a plan and its sheets into batches and ticks", [true, true, true]],
      [3, "Build and tests", null],
    ]);
    strictEqual(s.steps[2].doneLine, "Done (2026-10-20) — npm test — exit 0, whole suite");
    deepStrictEqual(sheetProgress(s), { behaviourSteps: 2, red: 2, green: 2, cost: 2, complete: 2 });
    deepStrictEqual(s.problems, []);
  });

  it("F2: open, depends on F1, partial ticks, no Done line", () => {
    const s = parseBatchSheet(fixture("DEMO-PLAN-F2.md"));
    deepStrictEqual([s.name, s.doneDate, s.dependsOn], ["Command", undefined, ["F1"]]);
    strictEqual(s.steps[2].doneLine, undefined);
    strictEqual(s.steps[2].tdd, null);
    deepStrictEqual(sheetProgress(s), { behaviourSteps: 2, red: 1, green: 0, cost: 0, complete: 0 });
  });

  it("F3: the fenced lines are skipped", () => {
    const s = parseBatchSheet(fixture("DEMO-PLAN-F3.md"));
    deepStrictEqual(s.steps.map((st) => st.title), ["Add the command page in English and French", "Build and tests"]);
    deepStrictEqual(sheetProgress(s), { behaviourSteps: 1, red: 0, green: 0, cost: 0, complete: 0 });
    deepStrictEqual(s.problems, []);
    const plan = parseGlobalPlan(fixture("DEMO-PLAN-F3.md"));
    deepStrictEqual(plan.batches, []);
  });
});

describe("parseBatchSheet inline", () => {
  it("reports a TDD line with other words", () => {
    const s = parseBatchSheet("# X-PLAN-F1 — N\n\n### Step 1 — A\nTDD: RED [x] GREEN\n");
    deepStrictEqual(s.problems, [{ line: 4, message: "malformed TDD line 'TDD: RED [x] GREEN'" }]);
    strictEqual(s.steps[0].tdd, null);
  });

  it("reads a list of dependencies, only in the Intent section", () => {
    const s = parseBatchSheet("## Intent\nx. **Depends on**: F1, F3\n\n## Design\n**Depends on**: F9\n");
    deepStrictEqual(s.dependsOn, ["F1", "F3"]);
  });

  it("drops the full stop that ends a list of dependencies", () => {
    const s = parseBatchSheet("## Intent\n**Depends on**: F1, F2.\n");
    deepStrictEqual(s.dependsOn, ["F1", "F2"]);
  });

  it("reports a second TDD line inside one step", () => {
    const s = parseBatchSheet("### Step 1 — A\nTDD: RED [ ] GREEN [ ] COST [ ]\nTDD: RED [x] GREEN [x] COST [x]\n");
    deepStrictEqual(s.problems, [{ line: 3, message: "step 1 has two TDD: lines" }]);
    deepStrictEqual(s.steps[0].tdd, { red: false, green: false, cost: false, line: 2 });
  });
  it("keeps the TDD ticks' line", () => {
    const s = parseBatchSheet("### Step 1 — A\n\nTDD: RED [x] GREEN [X] COST [ ]\n");
    deepStrictEqual(s.steps[0].tdd, { red: true, green: true, cost: false, line: 3 });
  });
});

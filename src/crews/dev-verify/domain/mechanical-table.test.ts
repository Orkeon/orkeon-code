// Unit tests for the mechanical table. Run:
//   node --test src/crews/dev-verify/domain/mechanical-table.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { COST_NOT_COMPUTED } from "../../../shared/domain/dev/access-cost.ts";
import { traitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import type { TableInput, TableRow } from "./mechanical-table.ts";
import { escapeCell, mechanicalRows, renderTable } from "./mechanical-table.ts";

function input(over: Partial<TableInput> = {}): TableInput {
  return {
    build: { state: "run", exit: 0, why: "" },
    trait: traitMarker("BR", undefined), ids: ["BR-01", "BR-02"],
    methods: ["Adds_a_line", "Refuses_zero"], testRoots: ["tests"],
    methodHits: ["tests/A.cs:10:Adds_a_line", "tests/A.cs:22:Refuses_zero"],
    testLog: { name: "F2-test.txt", summary: { passed: 12, failed: 0, exit: 0 } }, testLogLooked: "workbench/demo/logs/",
    roots: ["src", "tests"],
    cost: COST_NOT_COMPUTED,
    tickedLines: 3, planDirName: "demo",
    appliedRulesRow: "| Applied rules | DDD-01, APP-02 |", appliedIds: ["DDD-01", "APP-02"],
    ...over,
  };
}

function at(over: Partial<TableInput>, index: number): Omit<TableRow, "axis" | "check"> {
  const r = mechanicalRows(input(over))[index];
  return { result: r.result, evidence: r.evidence };
}

describe("mechanicalRows", () => {
  it("gives the 10 rows in order", () => {
    deepStrictEqual(mechanicalRows(input()).map((r) => `${r.axis}: ${r.check}`), [
      "Build: capture `build`",
      "Test: ids carried by traits",
      "Test: step-table methods in the test roots",
      "Test: last test run",
      "Scope: changed files in the batch",
      "Cost: capture `cost`",
      "Conventions: layer rules of the changed layers",
      "Plan: `TDD:` lines ticked",
      "Plan: design ids classified",
      "Plan: `Applied rules` ids are design-rule ids",
    ]);
  });

  it("row 1, the build", () => {
    deepStrictEqual(at({ build: { state: "none" } }, 0), { result: "not checked", evidence: "the pack has no commands.build" });
    deepStrictEqual(at({ build: { state: "reused", log: "workbench/demo/logs/F2-build.txt" } }, 0),
      { result: "ok", evidence: "`exit: 0` (reused F2-build.txt)" });
    deepStrictEqual(at({}, 0), { result: "ok", evidence: "`exit: 0` (run)" });
    deepStrictEqual(at({ build: { state: "run", exit: 1, why: "a.cs: error CS1002" } }, 0),
      { result: "gap", evidence: "`exit: 1` — a.cs: error CS1002" });
    deepStrictEqual(at({ build: { state: "timeout", seconds: 900 } }, 0), { result: "not checked", evidence: "timed out after 900 s" });
    deepStrictEqual(at({ build: { state: "refused", message: "denied" } }, 0),
      { result: "not checked", evidence: "the shell refused it: denied" });
  });

  it("row 2, the traits", () => {
    deepStrictEqual(at({ trait: null }, 1),
      { result: "not checked", evidence: "the pack has no tests.rule_trait or tests.trait_pattern" });
    deepStrictEqual(at({ ids: [] }, 1),
      { result: "not checked", evidence: "the sheet's `## TDD sequence` names no BR-/UC-/CH- id" });
    deepStrictEqual(at({}, 1),
      { result: "ok", evidence: 'gate: BR-01, BR-02 each carried as [Trait("BR", "…")] — capture `traits`' });
  });

  it("row 3, the step-table methods", () => {
    deepStrictEqual(at({ methods: [] }, 2), { result: "not checked", evidence: "the step tables name no test method" });
    deepStrictEqual(at({ testRoots: [] }, 2), { result: "not checked", evidence: "no test root in the pack's layout" });
    deepStrictEqual(at({ methodHits: null }, 2), { result: "not checked", evidence: "the test roots were not searched" });
    deepStrictEqual(at({}, 2), { result: "ok", evidence: "2/2 found (git grep --untracked), first `tests/A.cs:10`" });
    deepStrictEqual(at({ methodHits: ["tests/A.cs:10:Adds_a_line_too"], testRoots: ["tests", "specs"] }, 2),
      { result: "gap", evidence: "absent from tests specs: `Adds_a_line`, `Refuses_zero`" });
  });

  it("row 4, the last test run", () => {
    deepStrictEqual(at({ testLog: null }, 3), { result: "not checked", evidence: "no test log in workbench/demo/logs/" });
    deepStrictEqual(at({}, 3), { result: "ok", evidence: "passed 12, failed 0, `exit=0` — F2-test.txt" });
    deepStrictEqual(at({ testLog: { name: "t.txt", summary: { passed: 3, failed: 1, exit: null } } }, 3),
      { result: "gap", evidence: "passed 3, failed 1, no `exit=` line — t.txt" });
    deepStrictEqual(at({ testLog: { name: "t.txt", summary: { passed: null, failed: null, exit: 2 } } }, 3),
      { result: "gap", evidence: "passed -, failed -, `exit=2` — t.txt" });
    deepStrictEqual(at({ testLog: { name: "t.txt", summary: { passed: null, failed: null, exit: null } } }, 3),
      { result: "not checked", evidence: "no summary line and no `exit=` in the tail of t.txt" });
  });

  it("row 5, the scope", () => {
    deepStrictEqual(at({ roots: [] }, 4), { result: "not checked", evidence: "the pack names no layout root" });
    deepStrictEqual(at({}, 4), {
      result: "ok",
      evidence: "gate: every changed file under src tests, the plan folder or named by the sheet — capture `changed-files`",
    });
  });

  it("row 6, the cost", () => {
    deepStrictEqual(at({}, 5), { result: "not checked", evidence: `not computed — ${COST_NOT_COMPUTED.state === "not-computed" ? COST_NOT_COMPUTED.reason : ""}` });
    deepStrictEqual(at({ cost: { state: "measured", exit: 0, flagged: [], costLine: "", detail: "" } }, 5),
      { result: "ok", evidence: "`exit: 0`" });
    deepStrictEqual(at({ cost: { state: "measured", exit: 2, flagged: ["a loop", "a lambda"], costLine: "", detail: "" } }, 5),
      { result: "gap", evidence: "`exit: 2` a loop · a lambda" });
  });

  it("rows 7 to 9", () => {
    deepStrictEqual(at({}, 6), { result: "not checked", evidence: "judged pass (the auditor)" });
    deepStrictEqual(at({}, 7), { result: "ok", evidence: "gate: 3 ticked, none open" });
    deepStrictEqual(at({}, 8),
      { result: "ok", evidence: "gate: every DDD-/APP-/PERF- id applied or on `Non-applicable rules` of demo/" });
  });

  it("row 10, the applied rules", () => {
    deepStrictEqual(at({ appliedRulesRow: null }, 9), { result: "gap", evidence: "the sheet has no `Applied rules` row" });
    deepStrictEqual(at({ appliedIds: ["X-01", "DDD-01", "Y-02"] }, 9),
      { result: "gap", evidence: "unknown design-rule ids: `X-01`, `Y-02`" });
    deepStrictEqual(at({ appliedIds: [] }, 9), { result: "ok", evidence: "the row cites no id" });
    deepStrictEqual(at({}, 9), { result: "ok", evidence: "DDD-01, APP-02, each a design-rule id" });
  });

  it("is never ok for the build when nothing ran", () => {
    strictEqual(mechanicalRows(input({ build: { state: "none" } }))[0].result, "not checked");
  });
});

describe("escapeCell and renderTable", () => {
  it("escapes pipes and line breaks", () => {
    strictEqual(escapeCell("a | b\nc\r\nd"), "a \\| b · c · d");
  });
  it("writes the heading and the header lines", () => {
    const lines = renderTable("F2", mechanicalRows(input())).split("\n");
    deepStrictEqual(lines.slice(0, 4), [
      "# Mechanical audit — F2", "", "| Axis | Check | Result | Evidence |", "|------|-------|--------|----------|",
    ]);
    strictEqual(lines[4], "| Build | capture `build` | ok | `exit: 0` (run) |");
    strictEqual(lines.length, 15);
    strictEqual(lines[14], "");
  });
});

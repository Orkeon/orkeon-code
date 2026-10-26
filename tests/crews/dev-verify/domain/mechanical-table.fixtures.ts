// The inputs the mechanical table is tested on, and the result and evidence expected of each row.
import { COST_NOT_WIRED } from "../../../../src/shared/domain/dev/access-cost.ts";
import { traitMarker } from "../../../../src/shared/domain/dev/trait-pattern.ts";
import type { TableInput, TableRow } from "../../../../src/crews/dev-verify/domain/mechanical-table.ts";

/** The table input of a batch F2 whose build ran green, `over` replacing its fields. */
export function tableInput(over: Partial<TableInput> = {}): TableInput {
  return {
    build: { state: "run", exit: 0, why: "" },
    trait: traitMarker("BR", undefined), ids: ["BR-01", "BR-02"],
    methods: ["Adds_a_line", "Refuses_zero"], testRoots: ["tests"],
    methodHits: ["tests/A.cs:10:Adds_a_line", "tests/A.cs:22:Refuses_zero"],
    testLog: { name: "F2-test.txt", summary: { passed: 12, failed: 0, exit: 0 } }, testLogLooked: "workbench/demo/logs/",
    roots: ["src", "tests"],
    cost: COST_NOT_WIRED,
    tickedLines: 3, planDirName: "demo",
    appliedRulesRow: "| Applied rules | DDD-01, APP-02 |", appliedIds: ["DDD-01", "APP-02"],
    ...over,
  };
}

export const ROW_TITLES: readonly string[] = [
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
];

export type RowOutcome = Omit<TableRow, "axis" | "check">;

export interface RowCase {
  name: string;
  over: Partial<TableInput>;
  index: number;
  expected: RowOutcome;
}

/** Row 1, the build. */
export const BUILD_ROW_CASES: readonly RowCase[] = [
  {
    name: "no build in the pack", over: { build: { state: "none" } }, index: 0,
    expected: { result: "not checked", evidence: "the pack has no commands.build" },
  },
  {
    name: "a build log reused", over: { build: { state: "reused", log: "workbench/demo/logs/F2-build.txt" } }, index: 0,
    expected: { result: "ok", evidence: "`exit: 0` (reused F2-build.txt)" },
  },
  { name: "a green build run", over: {}, index: 0, expected: { result: "ok", evidence: "`exit: 0` (run)" } },
  {
    name: "a failed build run", over: { build: { state: "run", exit: 1, why: "a.cs: error CS1002" } }, index: 0,
    expected: { result: "gap", evidence: "`exit: 1` — a.cs: error CS1002" },
  },
  {
    name: "a build timed out", over: { build: { state: "timeout", seconds: 900 } }, index: 0,
    expected: { result: "not checked", evidence: "timed out after 900 s" },
  },
  {
    name: "a build the shell refused", over: { build: { state: "refused", message: "denied" } }, index: 0,
    expected: { result: "not checked", evidence: "the shell refused it: denied" },
  },
];

/** Row 2, the traits. */
export const TRAITS_ROW_CASES: readonly RowCase[] = [
  {
    name: "no trait in the pack", over: { trait: null }, index: 1,
    expected: { result: "ok", evidence: "not applicable: the pack has no tests.rule_trait or tests.trait_pattern" },
  },
  {
    name: "no id in the sheet", over: { ids: [] }, index: 1,
    expected: { result: "not checked", evidence: "the sheet's `## TDD sequence` names no BR-/UC-/CH- id" },
  },
  {
    name: "every id carried", over: {}, index: 1,
    expected: { result: "ok", evidence: 'gate: BR-01, BR-02 each carried as [Trait("BR", "…")] — capture `traits`' },
  },
];

/** Row 3, the step-table methods. */
export const METHODS_ROW_CASES: readonly RowCase[] = [
  {
    name: "no method in the step tables", over: { methods: [] }, index: 2,
    expected: { result: "not checked", evidence: "the step tables name no test method" },
  },
  {
    name: "no test root", over: { testRoots: [] }, index: 2,
    expected: { result: "not checked", evidence: "no test root in the pack's layout" },
  },
  {
    name: "the test roots not searched", over: { methodHits: null }, index: 2,
    expected: { result: "not checked", evidence: "the test roots were not searched" },
  },
  {
    name: "every method found", over: {}, index: 2,
    expected: { result: "ok", evidence: "2/2 found (git grep --untracked), first `tests/A.cs:10`" },
  },
  {
    name: "a hit on a longer name only",
    over: { methodHits: ["tests/A.cs:10:Adds_a_line_too"], testRoots: ["tests", "specs"] }, index: 2,
    expected: { result: "gap", evidence: "absent from tests specs: `Adds_a_line`, `Refuses_zero`" },
  },
];

/** Row 4, the last test run. */
export const TEST_RUN_ROW_CASES: readonly RowCase[] = [
  {
    name: "no test log", over: { testLog: null }, index: 3,
    expected: { result: "not checked", evidence: "no test log in workbench/demo/logs/" },
  },
  {
    name: "a green run", over: {}, index: 3,
    expected: { result: "ok", evidence: "passed 12, failed 0, `exit=0` — F2-test.txt" },
  },
  {
    name: "a failed test and no exit line",
    over: { testLog: { name: "t.txt", summary: { passed: 3, failed: 1, exit: null } } }, index: 3,
    expected: { result: "gap", evidence: "passed 3, failed 1, no `exit=` line — t.txt" },
  },
  {
    name: "a non-zero exit and no summary",
    over: { testLog: { name: "t.txt", summary: { passed: null, failed: null, exit: 2 } } }, index: 3,
    expected: { result: "gap", evidence: "passed -, failed -, `exit=2` — t.txt" },
  },
  {
    name: "neither summary nor exit",
    over: { testLog: { name: "t.txt", summary: { passed: null, failed: null, exit: null } } }, index: 3,
    expected: { result: "not checked", evidence: "no summary line and no `exit=` in the tail of t.txt" },
  },
];

/** Row 5, the scope. */
export const SCOPE_ROW_CASES: readonly RowCase[] = [
  {
    name: "no layout root", over: { roots: [] }, index: 4,
    expected: { result: "not checked", evidence: "the pack names no layout root" },
  },
  {
    name: "layout roots named", over: {}, index: 4,
    expected: {
      result: "ok",
      evidence: "gate: every changed file under src tests, the plan folder or named by the sheet — capture `changed-files`",
    },
  },
];

/** Row 6, the cost. */
export const COST_ROW_CASES: readonly RowCase[] = [
  {
    name: "the cost not wired", over: {}, index: 5,
    expected: {
      result: "not checked",
      evidence: `not computed — ${COST_NOT_WIRED.state === "not-computed" ? COST_NOT_WIRED.reason : ""}`,
    },
  },
  {
    name: "a cost measured clean",
    over: { cost: { state: "measured", exit: 0, flagged: [], costLine: "Cost: 1 read + 0 writes", detail: "" } }, index: 5,
    expected: { result: "ok", evidence: "`exit: 0` — Cost: 1 read + 0 writes" },
  },
  {
    name: "a cost with flagged constructs",
    over: { cost: { state: "measured", exit: 2, flagged: ["a loop", "a lambda"], costLine: "", detail: "" } }, index: 5,
    expected: { result: "gap", evidence: "`exit: 2` a loop · a lambda" },
  },
];

/** Fourteen flagged constructs: more than the cost row shows. */
export const FOURTEEN_FLAGGED: readonly string[] = Array.from({ length: 14 }, (_, i) => `f${i + 1}`);

/** Rows 7 to 9. */
export const ROWS_7_TO_9_CASES: readonly RowCase[] = [
  { name: "row 7, the conventions", over: {}, index: 6, expected: { result: "not checked", evidence: "judged pass (the auditor)" } },
  { name: "row 8, the TDD lines", over: {}, index: 7, expected: { result: "ok", evidence: "gate: 3 ticked, none open" } },
  {
    name: "row 9, the design ids", over: {}, index: 8,
    expected: { result: "ok", evidence: "gate: every DDD-/APP-/PERF- id applied or on `Non-applicable rules` of demo/" },
  },
];

/** Row 10, the applied rules. */
export const APPLIED_ROW_CASES: readonly RowCase[] = [
  {
    name: "no Applied rules row", over: { appliedRulesRow: null }, index: 9,
    expected: { result: "gap", evidence: "the sheet has no `Applied rules` row" },
  },
  {
    name: "unknown ids", over: { appliedIds: ["X-01", "DDD-01", "Y-02"] }, index: 9,
    expected: { result: "gap", evidence: "unknown design-rule ids: `X-01`, `Y-02`" },
  },
  { name: "no id", over: { appliedIds: [] }, index: 9, expected: { result: "ok", evidence: "the row cites no id" } },
  { name: "design-rule ids", over: {}, index: 9, expected: { result: "ok", evidence: "DDD-01, APP-02, each a design-rule id" } },
];

/** The heading and header lines of a rendered table. */
export const TABLE_HEAD: readonly string[] = [
  "# Mechanical audit — F2", "", "| Axis | Check | Result | Evidence |", "|------|-------|--------|----------|",
];

/** The row cases by row, each group named as the test names it. */
export const ROW_GROUPS: readonly (readonly [string, readonly RowCase[]])[] = [
  ["row 1, the build", BUILD_ROW_CASES],
  ["row 2, the traits", TRAITS_ROW_CASES],
  ["row 3, the step-table methods", METHODS_ROW_CASES],
  ["row 4, the last test run", TEST_RUN_ROW_CASES],
  ["row 5, the scope", SCOPE_ROW_CASES],
  ["row 6, the cost", COST_ROW_CASES],
  ["rows 7 to 9", ROWS_7_TO_9_CASES],
  ["row 10, the applied rules", APPLIED_ROW_CASES],
];

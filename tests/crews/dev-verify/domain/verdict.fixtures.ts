// The audit rows, gap rows and section inputs the verdict is tested on.
import type { AuditRow } from "../../../../src/crews/dev-verify/domain/audit-answer.ts";
import type { TableRow } from "../../../../src/crews/dev-verify/domain/mechanical-table.ts";
import type { VerdictSectionInput } from "../../../../src/crews/dev-verify/domain/verdict.ts";
import { carriedRows } from "../../../../src/crews/dev-verify/domain/verdict.ts";
import type { Verdict } from "../../../../src/shared/domain/dev/verdict-format.ts";

export const minor: AuditRow = { severity: "Minor", axis: "Simplification", gap: "a helper kept twice", evidence: "src/a.ts:4", fix: "fold them" };
export const major: AuditRow = { severity: "Major", axis: "Test", gap: "the refusal has no test", evidence: "src/b.ts:9", fix: "add one" };
export const blocking: AuditRow = { severity: "Blocking", axis: "Correctness", gap: "a total off by one", evidence: "src/c.ts:2", fix: "count from 0" };

/** A gap row of the mechanical table. */
export function gapRow(axis: string, check: string, evidence = "ev"): TableRow {
  return { axis, check, result: "gap", evidence };
}

/** The learning pass's reading of a verdict file (LC:117-128), ported line for line. */
export function gapRowsAsTheLearningPassReadsThem(text: string): string[][] {
  const verdictLine = /^##\s+Verdict\s+—\s+GAPS\s*$/;
  const severities = new Set(["Blocking", "Major"]);
  const out: string[][] = [];
  let inside = false;
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (line.startsWith("#")) { inside = verdictLine.test(line); continue; }
    if (!inside) continue;
    const cells = line.trim().replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cells.length >= 5 && severities.has(cells[0])) {
      out.push([cells[0], cells[1], cells.slice(2, -2).join(" | "), cells[cells.length - 2], cells[cells.length - 1]]);
    }
  }
  return out;
}

export interface DecideCase {
  name: string;
  rows: readonly AuditRow[];
  expected: Verdict;
}

export const DECIDE_CASES: readonly DecideCase[] = [
  { name: "no row", rows: [], expected: "VALID" },
  { name: "a Minor row", rows: [minor], expected: "VALID" },
  { name: "a Minor and a Major row", rows: [minor, major], expected: "GAPS" },
  { name: "a Blocking row", rows: [blocking], expected: "GAPS" },
];

/** Five gaps of the mechanical table, then a row ok and one not checked. */
export const GAP_TABLE: readonly TableRow[] = [
  gapRow("Build", "capture `build`", "`exit: 1` — error CS1002"),
  gapRow("Test", "last test run"),
  gapRow("Test", "step-table methods in the test roots"),
  gapRow("Plan", "`Applied rules` ids are design-rule ids"),
  gapRow("Cost", "capture `cost`"),
  { axis: "Scope", check: "changed files in the batch", result: "ok", evidence: "gate" },
  { axis: "Conventions", check: "layer rules of the changed layers", result: "not checked", evidence: "x" },
];

/** The severity, axis and gap of each row GAP_TABLE carries. */
export const GAP_TABLE_CARRIED: readonly string[][] = [
  ["Blocking", "Correctness", "the build is red: capture `build`"],
  ["Blocking", "Test", "last test run"],
  ["Major", "Test", "step-table methods in the test roots"],
  ["Major", "Plan", "`Applied rules` ids are design-rule ids"],
  ["Major", "Cost", "capture `cost`"],
];

export interface DropCase {
  name: string;
  answer: readonly AuditRow[];
  expected: readonly string[][];
}

/** A red suite, a red build and a test-classes gap, against an answer row on the Test axis or the Correctness one. */
export const DROP_TABLE: readonly TableRow[] = [gapRow("Test", "last test run"), gapRow("Build", "capture `build`"), gapRow("Test", "test classes")];

export const DROP_CASES: readonly DropCase[] = [
  { name: "a Major answer row on Test", answer: [major], expected: [["Blocking", "Test"], ["Blocking", "Correctness"]] },
  { name: "a Blocking answer row on Correctness", answer: [blocking], expected: [["Blocking", "Test"], ["Major", "Test"]] },
];

/** Minor answer rows on the axes of a red build and a red suite. */
export const MINOR_ON_RED_AXES: readonly AuditRow[] = [
  { ...minor, axis: "Correctness" },
  { ...minor, axis: "Test" },
];

/** A red build and a red suite. */
export const RED_BUILD_AND_SUITE: readonly TableRow[] = [gapRow("Build", "capture `build`"), gapRow("Test", "last test run")];

/** Thirteen rows: four Minor, seven Major, one Blocking and a last Minor on Reuse. */
export const THIRTEEN_ROWS: readonly AuditRow[] = [
  ...Array.from({ length: 4 }, () => minor),
  ...Array.from({ length: 6 }, () => major),
  { ...major, axis: "Plan" },
  blocking,
  { ...minor, axis: "Reuse" },
];

/** A fast section of batch F2 of DEMO, `over` replacing its fields. */
export function sectionInput(over: Partial<VerdictSectionInput> = {}): VerdictSectionInput {
  return { prefix: "DEMO", batch: "F2", when: "2026-10-22 14:05", mode: "fast", notRun: [], rows: [], validations: [], ...over };
}

/** The GAPS section of a Minor and a Major row, one validation and one command not run. */
export const GAPS_SECTION_TEXT = [
  "# DEMO-VERIFY-F2 — 2026-10-22 14:05 — fast",
  "",
  "## Verdict — GAPS",
  "",
  "| Severity | Axis | Gap | Evidence | Expected fix |",
  "|----------|------|-----|----------|--------------|",
  "| Major | Test | the refusal has no test | src/b.ts:9 | add one |",
  "| Minor | Simplification | a helper kept twice | src/a.ts:4 | fold them |",
  "",
  "Validations: `npm run t` — exit 0, scope a, 3 tests",
  "Not run: `npm test` — refused: not one of the pack's test_class, test_project or test_integration commands",
  "",
].join("\n");

/** A row whose cells hold pipes, a line break and a fix of 400 characters. */
export const ROW_TO_ESCAPE: AuditRow = {
  severity: "Major", axis: "Test", gap: "a|b  |c\nnext", evidence: "x | y", fix: "z".repeat(400),
};

/** A full section of every severity, a gap with a pipe and a carried Plan gap, to be read back. */
export function parseBackSection(): VerdictSectionInput {
  const rows: AuditRow[] = [
    blocking,
    { ...major, gap: "two cases | one test" },
    minor,
    ...carriedRows([blocking, major], [gapRow("Plan", "`Applied rules` ids are design-rule ids", "unknown design-rule ids: `X-01`")]),
  ];
  return sectionInput({ mode: "full", rows, validations: ["`v` — exit 0, scope s, 4 tests"], notRun: ["Placement — unclear"] });
}

/** The severity, axis and gap verdict-format reads from the parse-back section. */
export const PARSED_BACK_ROWS: readonly string[][] = [
  ["Blocking", "Correctness", "a total off by one"],
  ["Major", "Test", "two cases | one test"],
  ["Major", "Plan", "`Applied rules` ids are design-rule ids"],
  ["Minor", "Simplification", "a helper kept twice"],
];

/** The gap rows the learning pass reads from the parse-back section. */
export const LEARNING_PASS_ROWS: readonly string[][] = [
  ["Blocking", "Correctness", "a total off by one", "src/c.ts:2", "count from 0"],
  ["Major", "Test", "two cases | one test", "src/b.ts:9", "add one"],
  ["Major", "Plan", "`Applied rules` ids are design-rule ids", "unknown design-rule ids: `X-01`",
    "see table.md: `Applied rules` ids are design-rule ids"],
];

export interface ReplaceCase {
  mode: "fast" | "full";
  section: string;
}

/** A section with or without its final newline replaces the previous file. */
export const REPLACE_CASES: readonly ReplaceCase[] = [
  { mode: "fast", section: "new\n" },
  { mode: "full", section: "new" },
];

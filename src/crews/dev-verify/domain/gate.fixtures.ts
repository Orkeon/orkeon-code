// The sheet, plan and inputs the five gate checks are tested on, and the lines they print.
import type { GateInput, GateLineKind } from "./gate.ts";
import { sheetFacts } from "./sheet-facts.ts";
import { traitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import { WORKSPACE } from "../../../shared/domain/dev/path-rebase.ts";

export const SHEET = [
  "# DEMO-PLAN-F2 — Command",
  "| Applied rules | DDD-01, DDD-02, APP-01 |",
  "## TDD sequence",
  "### Step 1 — Print the state",
  "| # | Test | Ids |",
  "|---|------|-----|",
  "| 1 | `ShowsTheState` | BR-01 |",
  "TDD: RED [x] GREEN [x] COST [x]",
  "## Decisions",
  "README.md is updated with the command.",
].join("\n");

export const PLAN = "# DEMO-PLAN\n**Non-applicable rules**: DDD-03, DDD-04, DDD-05, DDD-06, DDD-07, DDD-08, DDD-09, DDD-10, DDD-11, " +
  "APP-02, APP-03, APP-04, APP-05, PERF-01 (none applies)\nBR-01 is the state rule.\n";

/** The gate input of a green batch F2, `over` replacing its fields; the facts are read from the sheet given. */
export function gateInput(over: Partial<GateInput> = {}): GateInput {
  const sheet = over.sheet ?? SHEET;
  return {
    batch: "F2",
    sheetShown: "workbench/demo/DEMO-PLAN-F2.md",
    sheet,
    facts: sheetFacts(sheet),
    plan: { sheets: [sheet], plans: [PLAN], all: [sheet, PLAN] },
    planDirShown: "workbench/demo",
    planDirAbsolute: `${WORKSPACE}/workbench/demo`,
    roots: ["src", "tests/"],
    changedFiles: ["README.md", "src/a.ts", "tests/a.test.ts", "workbench/demo/DEMO-PLAN-F2.md"],
    trait: traitMarker("BR", undefined),
    traitHits: ['tests/a.test.ts:4:[Trait("BR", "BR-01")]'],
    diffCheckExit: 0,
    ...over,
  };
}

/** The fields of a sheet given in place of SHEET: the sheet, and the plan folder that holds it beside `plan`. */
export function withSheet(sheet: string, plan = PLAN): Pick<GateInput, "sheet" | "plan"> {
  return { sheet, plan: { sheets: [sheet], plans: [plan], all: [sheet, plan] } };
}

export const HEADER = "GATE — batch F2 — sheet workbench/demo/DEMO-PLAN-F2.md";
export const OK = {
  closed: "  ok   sheet: every step reads `TDD: RED [x] GREEN [x] COST [x]`",
  design: "  ok   design ids: all applied or non-applicable",
  scope: "  ok   scope: every changed file is under src tests/ or named by the sheet",
  traits: '  ok   rule traits: every id of the sheet is carried by a test, [Trait("BR", "<id>")]',
  check: "  ok   git diff --check: clean",
};
export const GREEN = "GATE — batch F2: GREEN";
export const RED = "GATE — batch F2: RED — fix and run again, no audit before";

export interface NoteCase {
  name: string;
  over: Partial<GateInput>;
  index: number;
  line: string;
}

/** The three notes the gate prints in place of a check it cannot make, the gate staying green. */
export const NOTE_CASES: readonly NoteCase[] = [
  {
    name: "no layout root",
    over: { roots: [] },
    index: 3,
    line: "       scope: the pack names no layout root, not checked",
  },
  {
    name: "no rule trait",
    over: { trait: null, traitHits: null },
    index: 4,
    line: "       rule traits: the pack has no tests.rule_trait, not checked",
  },
  {
    name: "no id in the TDD sequence",
    over: { ...withSheet(SHEET.replace("| BR-01 |", "| — |")), traitHits: null },
    index: 4,
    line: "       rule traits: the sheet's `## TDD sequence` names no BR-/UC-/CH- id, nothing to check",
  },
];

export interface LineTextCase {
  kind: GateLineKind;
  expected: string;
}

export const LINE_TEXT_CASES: readonly LineTextCase[] = [
  { kind: "ok", expected: "  ok   t" },
  { kind: "FAIL", expected: "  FAIL t" },
  { kind: "note", expected: "       t" },
];

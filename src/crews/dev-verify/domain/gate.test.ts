// Unit tests for the five gate checks, on inline inputs. Run:
//   node --test src/crews/dev-verify/domain/gate.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { gateLineText, runGateChecks } from "./gate.ts";
import type { GateInput } from "./gate.ts";
import { sheetFacts } from "./sheet-facts.ts";
import { traitMarker } from "../../../shared/domain/dev/trait-pattern.ts";

const SHEET = [
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
const PLAN = "# DEMO-PLAN\n**Non-applicable rules**: DDD-03, DDD-04, DDD-05, DDD-06, DDD-07, DDD-08, DDD-09, DDD-10, DDD-11, " +
  "APP-02, APP-03, APP-04, APP-05, PERF-01 (none applies)\nBR-01 is the state rule.\n";

function input(over: Partial<GateInput> = {}): GateInput {
  const sheet = over.sheet ?? SHEET;
  return {
    batch: "F2",
    sheetShown: "workbench/demo/DEMO-PLAN-F2.md",
    sheet,
    facts: sheetFacts(sheet),
    plan: { sheets: [sheet], plans: [PLAN], all: [sheet, PLAN] },
    planDirShown: "workbench/demo",
    planDirAbsolute: "/workspace/workbench/demo",
    roots: ["src", "tests/"],
    changedFiles: ["README.md", "src/a.ts", "tests/a.test.ts", "workbench/demo/DEMO-PLAN-F2.md"],
    trait: traitMarker("BR", undefined),
    traitHits: ['tests/a.test.ts:4:[Trait("BR", "BR-01")]'],
    diffCheckExit: 0,
    ...over,
  };
}

const HEADER = "GATE — batch F2 — sheet workbench/demo/DEMO-PLAN-F2.md";
const OK = {
  closed: "  ok   sheet: every step reads `TDD: RED [x] GREEN [x] COST [x]`",
  design: "  ok   design ids: all applied or non-applicable",
  scope: "  ok   scope: every changed file is under src tests/ or named by the sheet",
  traits: '  ok   rule traits: every id of the sheet is carried by a test, [Trait("BR", "<id>")]',
  check: "  ok   git diff --check: clean",
};
const GREEN = "GATE — batch F2: GREEN";
const RED = "GATE — batch F2: RED — fix and run again, no audit before";

describe("runGateChecks", () => {
  it("prints the five ok lines on a green batch", () => {
    const r = runGateChecks(input());
    strictEqual(r.green, true);
    deepStrictEqual(r.lines, [HEADER, OK.closed, OK.design, OK.scope, OK.traits, OK.check, GREEN]);
    deepStrictEqual([r.missingDesignIds, r.outside, r.untested, r.stray], [[], [], [], []]);
  });
  it("fails check 1 alone on an open TDD line", () => {
    const sheet = SHEET.replace("COST [x]", "COST [ ]");
    const r = runGateChecks(input({ sheet, plan: { sheets: [sheet], plans: [PLAN], all: [sheet, PLAN] } }));
    strictEqual(r.green, false);
    deepStrictEqual(r.lines, [HEADER, "  FAIL sheet not closed: a `TDD:` line is still open, or none is ticked",
      OK.design, OK.scope, OK.traits, OK.check, RED]);
  });
  it("fails check 2 alone on unclassified design ids", () => {
    const plan = PLAN.replace("APP-05, PERF-01", "APP-05");
    const r = runGateChecks(input({ plan: { sheets: [SHEET], plans: [plan], all: [SHEET, plan] } }));
    strictEqual(r.green, false);
    deepStrictEqual(r.missingDesignIds, ["PERF-01"]);
    deepStrictEqual(r.lines[2], "  FAIL design ids neither on an `Applied rules` row nor on `Non-applicable rules`: PERF-01");
    deepStrictEqual(r.lines.filter((l) => l.startsWith("  FAIL")).length, 1);
  });
  it("does not take DDD-1 or ADDD-01 for DDD-01, nor a Non-applicable line of a sheet", () => {
    const sheet = SHEET.replace("DDD-01,", "DDD-1, XDDD-010,") + "\nNon-applicable rules: DDD-01\n";
    const r = runGateChecks(input({ sheet, plan: { sheets: [sheet], plans: [PLAN], all: [sheet, PLAN] } }));
    deepStrictEqual(r.missingDesignIds, ["DDD-01"]);
  });
  it("fails check 3 alone on a changed file outside the roots, one note per file", () => {
    const r = runGateChecks(input({ changedFiles: ["docs/notes.md", "src/a.ts", "srcx/b.ts"] }));
    strictEqual(r.green, false);
    deepStrictEqual(r.outside, ["docs/notes.md", "srcx/b.ts"]);
    deepStrictEqual(r.lines.slice(3, 6), [
      "  FAIL files changed outside src tests/ and absent from the sheet — name them under `## Decisions`, or restore them",
      "       docs/notes.md",
      "       srcx/b.ts",
    ]);
    strictEqual(r.lines.at(-1), RED);
  });
  it("fails check 4 alone on a sheet id no test carries, BR-1 not carried by BR-10", () => {
    const sheet = SHEET.replace("| BR-01 |", "| BR-01, BR-1 |");
    const r = runGateChecks(input({
      sheet, plan: { sheets: [sheet], plans: [PLAN], all: [sheet, PLAN] },
      traitHits: ['tests/a.test.ts:4:[Trait("BR", "BR-01")]', 'tests/BR-1/b.test.ts:9:[Trait("BR", "BR-10")]'],
    }));
    deepStrictEqual(r.untested, ["BR-1"]);
    deepStrictEqual(r.lines[4], '  FAIL ids of the sheet\'s TDD sequence that no test carries as [Trait("BR", "<id>")]: BR-1');
    strictEqual(r.green, false);
  });
  it("fails check 5 alone on a non-zero git diff --check", () => {
    const r = runGateChecks(input({ diffCheckExit: 2 }));
    deepStrictEqual(r.lines.slice(5), ["  FAIL git diff --check reports trailing whitespace or conflict markers", RED]);
  });
  it("prints the three notes", () => {
    const noRoots = runGateChecks(input({ roots: [] }));
    strictEqual(noRoots.lines[3], "       scope: the pack names no layout root, not checked");
    const noTrait = runGateChecks(input({ trait: null, traitHits: null }));
    strictEqual(noTrait.lines[4], "       rule traits: the pack has no tests.rule_trait, not checked");
    const sheet = SHEET.replace("| BR-01 |", "| — |");
    const noIds = runGateChecks(input({ sheet, plan: { sheets: [sheet], plans: [PLAN], all: [sheet, PLAN] }, traitHits: null }));
    strictEqual(noIds.lines[4], "       rule traits: the sheet's `## TDD sequence` names no BR-/UC-/CH- id, nothing to check");
    for (const r of [noRoots, noTrait, noIds]) strictEqual(r.green, true);
  });
  it("adds the stray note on a green gate, with the ids of the whole hit lines", () => {
    const r = runGateChecks(input({
      traitHits: ['tests/a.test.ts:4:[Trait("BR", "BR-01")]', 'tests/UC-5/a.test.ts:8:[Trait("BR", "BR-09")]'],
    }));
    strictEqual(r.green, true);
    deepStrictEqual(r.stray, ["BR-09", "UC-5"]);
    deepStrictEqual(r.lines.slice(4, 6), [OK.traits, "       traits citing an id absent from /workspace/workbench/demo/*.md: BR-09 UC-5"]);
  });
  it("reads the trait hits as none when the grep was not run", () => {
    deepStrictEqual(runGateChecks(input({ traitHits: null })).untested, ["BR-01"]);
  });
});

describe("gateLineText", () => {
  it("pads ok, FAIL and note as the harness does", () => {
    strictEqual(gateLineText({ kind: "ok", text: "t" }), "  ok   t");
    strictEqual(gateLineText({ kind: "FAIL", text: "t" }), "  FAIL t");
    strictEqual(gateLineText({ kind: "note", text: "t" }), "       t");
  });
});

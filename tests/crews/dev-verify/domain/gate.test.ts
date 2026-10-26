// Unit tests for the five gate checks, on inline inputs. Run:
//   node --test tests/crews/dev-verify/domain/gate.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { gateLineText, runGateChecks } from "../../../../src/crews/dev-verify/domain/gate.ts";
import {
  GREEN, HEADER, LINE_TEXT_CASES, NOTE_CASES, OK, PLAN, RED, SHEET, gateInput, withSheet,
} from "./gate.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("runGateChecks", () => {
  it("prints the five ok lines on a green batch", () => {
    // Arrange
    const input = gateInput();

    // Act
    const r = runGateChecks(input);

    // Assert
    strictEqual(r.green, true);
    deepStrictEqual(r.lines, [HEADER, OK.closed, OK.design, OK.scope, OK.traits, OK.check, GREEN]);
    deepStrictEqual([r.missingDesignIds, r.outside, r.untested, r.stray], [[], [], [], []]);
  });

  it("fails check 1 alone on an open TDD line", () => {
    // Arrange
    const input = gateInput(withSheet(SHEET.replace("COST [x]", "COST [ ]")));

    // Act
    const r = runGateChecks(input);

    // Assert
    strictEqual(r.green, false);
    deepStrictEqual(r.lines, [HEADER, "  FAIL sheet not closed: a `TDD:` line is still open, or none is ticked",
      OK.design, OK.scope, OK.traits, OK.check, RED]);
  });

  it("fails check 2 alone on unclassified design ids", () => {
    // Arrange
    const input = gateInput(withSheet(SHEET, PLAN.replace("APP-05, PERF-01", "APP-05")));

    // Act
    const r = runGateChecks(input);

    // Assert
    strictEqual(r.green, false);
    deepStrictEqual(r.missingDesignIds, ["PERF-01"]);
    deepStrictEqual(r.lines[2], "  FAIL design ids neither on an `Applied rules` row nor on `Non-applicable rules`: PERF-01");
    deepStrictEqual(r.lines.filter((l) => l.startsWith("  FAIL")).length, 1);
  });

  it("does not take DDD-1 or ADDD-01 for DDD-01, nor a Non-applicable line of a sheet", () => {
    // Arrange
    const sheet = SHEET.replace("DDD-01,", "DDD-1, XDDD-010,") + "\nNon-applicable rules: DDD-01\n";
    const input = gateInput(withSheet(sheet));

    // Act
    const r = runGateChecks(input);

    // Assert
    deepStrictEqual(r.missingDesignIds, ["DDD-01"]);
  });

  it("fails check 3 alone on a changed file outside the roots, one note per file", () => {
    // Arrange
    const input = gateInput({ changedFiles: ["docs/notes.md", "src/a.ts", "srcx/b.ts"] });

    // Act
    const r = runGateChecks(input);

    // Assert
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
    // Arrange
    const input = gateInput({
      ...withSheet(SHEET.replace("| BR-01 |", "| BR-01, BR-1 |")),
      traitHits: ['tests/a.test.ts:4:[Trait("BR", "BR-01")]', 'tests/BR-1/b.test.ts:9:[Trait("BR", "BR-10")]'],
    });

    // Act
    const r = runGateChecks(input);

    // Assert
    deepStrictEqual(r.untested, ["BR-1"]);
    deepStrictEqual(r.lines[4], '  FAIL ids of the sheet\'s TDD sequence that no test carries as [Trait("BR", "<id>")]: BR-1');
    strictEqual(r.green, false);
  });

  it("fails check 5 alone on a non-zero git diff --check", () => {
    // Arrange
    const input = gateInput({ diffCheckExit: 2 });

    // Act
    const r = runGateChecks(input);

    // Assert
    deepStrictEqual(r.lines.slice(5), ["  FAIL git diff --check reports trailing whitespace or conflict markers", RED]);
  });

  for (const c of NOTE_CASES) {
    it(`prints the three notes: ${c.name}`, () => {
      // Arrange
      const input = gateInput(c.over);

      // Act
      const r = runGateChecks(input);

      // Assert
      strictEqual(r.lines[c.index], c.line);
      strictEqual(r.green, true);
    });
  }

  it("adds the stray note on a green gate, with the ids of the whole hit lines", () => {
    // Arrange
    const input = gateInput({
      traitHits: ['tests/a.test.ts:4:[Trait("BR", "BR-01")]', 'tests/UC-5/a.test.ts:8:[Trait("BR", "BR-09")]'],
    });

    // Act
    const r = runGateChecks(input);

    // Assert
    strictEqual(r.green, true);
    deepStrictEqual(r.stray, ["BR-09", "UC-5"]);
    deepStrictEqual(r.lines.slice(4, 6), [OK.traits, `       traits citing an id absent from ${WORKSPACE}/workbench/demo/*.md: BR-09 UC-5`]);
  });

  it("reads the trait hits as none when the grep was not run", () => {
    // Arrange
    const input = gateInput({ traitHits: null });

    // Act
    const r = runGateChecks(input);

    // Assert
    deepStrictEqual(r.untested, ["BR-01"]);
  });
});

describe("gateLineText", () => {
  for (const c of LINE_TEXT_CASES) {
    it(`pads ${c.kind} as the harness does`, () => {
      // Arrange
      const line = { kind: c.kind, text: "t" };

      // Act
      const text = gateLineText(line);

      // Assert
      strictEqual(text, c.expected);
    });
  }
});

// A correction appended to a batch sheet. Run:
//   node --test tests/crews/dev-implement/domain/correction.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { addCorrection, cleanFinding, targetStep } from "../../../../src/crews/dev-implement/domain/correction.ts";
import { parseImplementSheet } from "../../../../src/crews/dev-implement/domain/step-section.ts";
import {
  SHEET, SHEET_NAMING_BR09_OUT_OF_SCOPE, sheetWithStep2Correction, sheetWithStep2CorrectionDone, STEP_2_FINDING,
} from "./correction.fixtures.ts";
import { assertAppended, assertOneOpenStep } from "./correction.assertions.ts";

describe("addCorrection", () => {
  it("appends a step after the last one, with the target's anchor row and an open TDD line", () => {
    // Arrange
    const finding = "Major Tests: src/a.ts ignores an empty list";

    // Act
    const edit = addCorrection(SHEET, finding);

    // Assert
    assertAppended(edit, 4, "Correction C1 — Major Tests: src/a.ts ignores an empty list");
    assertOneOpenStep(edit.text, 4, ["tests/a.test.ts"], ["BR-01"]);
  });

  it("targets the step the finding names", () => {
    // Arrange
    const finding = STEP_2_FINDING;

    // Act
    const first = addCorrection(SHEET, finding);

    // Assert
    ok(first.ok);
    strictEqual(parseImplementSheet(first.text).steps.find((s) => s.number === 4)?.anchor?.doubles, "`FakeClock`");
  });

  it("keeps an open correction of the same finding", () => {
    // Arrange
    const text = sheetWithStep2Correction();

    // Act
    const again = addCorrection(text, STEP_2_FINDING);

    // Assert
    ok(again.ok && !again.appended && again.text === text);
  });

  it("numbers the next correction after a ticked one", () => {
    // Arrange
    const ticked = sheetWithStep2CorrectionDone();

    // Act
    const second = addCorrection(ticked, "another gap");

    // Assert
    ok(second.ok && second.title === "Correction C2 — another gap" && second.step === 5);
  });

  it("refuses a finding naming an id the sheet does not carry", () => {
    // Arrange
    const finding = "BR-07 is not covered";

    // Act
    const refused = addCorrection(SHEET, finding);

    // Assert
    strictEqual(refused.ok, false);
    ok(!refused.ok && refused.reason.includes("BR-07, which the sheet does not carry"));
  });

  it("refuses an empty finding", () => {
    // Arrange
    const finding = "  ";

    // Act
    const refused = addCorrection(SHEET, finding);

    // Assert
    strictEqual(refused.ok, false);
  });

  it("reads only the ids of the sheet's prefixes: UTF-8 or SHA-256 is no id", () => {
    // Arrange
    const finding = "step 1 reads UTF-8 as SHA-256 input (BR-01)";

    // Act
    const edit = addCorrection(SHEET, finding);

    // Assert
    strictEqual(edit.ok, true);
  });

  it("refuses an id written outside the steps' test tables, which the steps do not carry", () => {
    // Arrange
    const named = SHEET_NAMING_BR09_OUT_OF_SCOPE;

    // Act
    const edit = addCorrection(named, "BR-09 is missing");

    // Assert
    ok(!edit.ok);
  });
});

describe("targetStep / cleanFinding", () => {
  it("falls back on the last step with a test file", () => {
    // Arrange
    const sheet = parseImplementSheet(SHEET);

    // Act
    const target = targetStep(sheet, "something");

    // Assert
    strictEqual(target?.number, 2);
  });

  it("puts the finding on one line, without the table's pipe", () => {
    // Arrange
    const finding = "a |\n b";

    // Act
    const clean = cleanFinding(finding);

    // Assert
    strictEqual(clean, "a / b");
  });
});

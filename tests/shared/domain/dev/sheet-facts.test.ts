// Unit tests for the facts the gate reads off a batch sheet. Run:
//   node --test src/shared/domain/dev/sheet-facts.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { sheetFacts } from "../../../../src/shared/domain/dev/sheet-facts.ts";
import { IDENTIFIER_AND_SENTENCE, NO_TICKED_LINE, OPEN_COST_SHEET, SHEET } from "./sheet-facts.fixtures.ts";

describe("sheetFacts", () => {
  it("reads the ids of `## TDD sequence` only, sorted and unique; `### Step` does not end it", () => {
    // Arrange
    const sheet = SHEET;

    // Act
    const facts = sheetFacts(sheet);

    // Assert
    deepStrictEqual(facts.ids, ["BR-01", "BR-02", "CH-3"]);
  });

  it("reads the Test column: backticks off, Class.Method cut, <placeholder> skipped, first-seen and unique", () => {
    // Arrange
    const sheet = SHEET;

    // Act
    const facts = sheetFacts(sheet);

    // Assert
    deepStrictEqual(facts.methods, ["ShowsTheState"]);
  });

  it("keeps an identifier test method and drops a sentence", () => {
    // Arrange
    const sheet = IDENTIFIER_AND_SENTENCE;

    // Act
    const facts = sheetFacts(sheet);

    // Assert
    deepStrictEqual(facts.methods, ["Should_Add"]);
  });

  it("reads the first Applied rules row and its ids in first-seen order", () => {
    // Arrange
    const sheet = SHEET;

    // Act
    const facts = sheetFacts(sheet);

    // Assert
    strictEqual(facts.appliedRulesRow, "| Applied rules | DDD-01, APP-02 (once), DDD-01, X-1 |");
    deepStrictEqual(facts.appliedIds, ["DDD-01", "APP-02", "X-1"]);
  });

  it("counts the ticked lines and calls the sheet closed", () => {
    // Arrange
    const sheet = SHEET;

    // Act
    const facts = sheetFacts(sheet);

    // Assert
    strictEqual(facts.tickedLines, 2);
    strictEqual(facts.closed, true);
  });

  it("is not closed with an open COST [ ]", () => {
    // Arrange
    const sheet = OPEN_COST_SHEET;

    // Act
    const open = sheetFacts(sheet);

    // Assert
    strictEqual(open.closed, false);
    strictEqual(open.tickedLines, 2);
  });

  for (const c of NO_TICKED_LINE) {
    it(`is not closed with no ticked line: ${c.name}`, () => {
      // Arrange
      const { sheet } = c;

      // Act
      const facts = sheetFacts(sheet);

      // Assert
      strictEqual(facts.closed, false);
    });
  }

  it("gives empty facts for a sheet without sections", () => {
    // Arrange
    const sheet = "";

    // Act
    const facts = sheetFacts(sheet);

    // Assert
    deepStrictEqual(facts, {
      ids: [], methods: [], appliedRulesRow: null, appliedIds: [], tickedLines: 0, closed: false,
    });
  });
});

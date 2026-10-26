// Unit tests for the design-rule ids and their wording. Run:
//   node --test tests/shared/domain/dev/design-rules.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { DESIGN_RULES, DESIGN_RULE_IDS, isDesignRuleId } from "../../../../src/shared/domain/dev/design-rules.ts";
import { EXPECTED_IDS, ID_CASES, readMarkers } from "./design-rules.fixtures.ts";
import { assertEachInItsFamily, assertFieldsFilled, assertNoMarker } from "./design-rules.assertions.ts";

describe("DESIGN_RULE_IDS", () => {
  it("holds the 17 ids in order", () => {
    // Arrange
    const expected = EXPECTED_IDS;

    // Act
    const ids = [...DESIGN_RULE_IDS];

    // Assert
    deepStrictEqual(ids, expected);
  });

  for (const c of ID_CASES) {
    it(`isDesignRuleId knows exactly those: ${c.id}`, () => {
      // Arrange
      const { id } = c;

      // Act
      const known = isDesignRuleId(id);

      // Assert
      strictEqual(known, c.expected);
    });
  }
});

describe("DESIGN_RULES", () => {
  it("lists the rules in DESIGN_RULE_IDS order, each in the family its id names", () => {
    // Arrange
    const expected = [...DESIGN_RULE_IDS];

    // Act
    const rules = [...DESIGN_RULES];

    // Assert
    deepStrictEqual(rules.map((r) => r.id), expected);
    assertEachInItsFamily(rules);
  });

  it("fills every field but notApplicableWhen, and keeps each behaviour within 200 characters", () => {
    // Arrange
    const [first, ...others] = DESIGN_RULES;

    // Act
    const rules = [first, ...others];

    // Assert
    assertFieldsFilled(rules);
    strictEqual(first.notApplicableWhen, "");
    ok(others.every((r) => r.notApplicableWhen !== ""));
  });

  it("holds no provenance or prompt marker", () => {
    // Arrange
    const markers = readMarkers();

    // Act
    const text = DESIGN_RULES.map((r) => Object.values(r).join("\n")).join("\n");

    // Assert
    assertNoMarker(text, markers);
  });
});

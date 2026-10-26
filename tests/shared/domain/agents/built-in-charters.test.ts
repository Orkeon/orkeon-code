// The built-in charters run as children of the dev steps (A-3). Run:
//   node --test src/shared/domain/agents/built-in-charters.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { BUILT_IN_CHARTERS, builtInCharter, builtInCharterRows, repairStep } from "../../../../src/shared/domain/agents/built-in-charters.ts";
import { CHARTER_STEPS, REPAIR_STEPS, REVIEWER_ROW } from "./built-in-charters.fixtures.ts";

describe("built-in charters", () => {
  for (const c of CHARTER_STEPS) {
    it(`the reviewer belongs to /dev-plan, the auditor to /dev-verify: ${c.charter}`, () => {
      // Arrange
      const name = c.charter;

      // Act
      const charter = builtInCharter(name);

      // Assert
      strictEqual(charter?.step, c.step);
    });
  }

  for (const c of REPAIR_STEPS) {
    it(`a repair runs under the step of the instance's run, else the charter's, else dev-plan's: ${c.name}`, () => {
      // Arrange
      const { charter, run } = c;

      // Act
      const step = repairStep(charter, run);

      // Assert
      strictEqual(step, c.step);
    });
  }

  it("gives /agents one row each", () => {
    // Arrange
    const expected = BUILT_IN_CHARTERS.map((c) => [c.name, "charter (built-in)"]);

    // Act
    const rows = builtInCharterRows();

    // Assert
    deepStrictEqual(rows.map((r) => [r.name, r.kind]), expected);
    strictEqual(rows[0].detail, REVIEWER_ROW);
  });
});

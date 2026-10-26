// The step budgets and the reader of a spent one, from the error or its message. Run:
//   node --test tests/shared/domain/dev/step-budget.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { readBudgetExhausted, repairBudget, STEP_BUDGETS } from "../../../../src/shared/domain/dev/step-budget.ts";
import { budgetError, OTHER_FAILURES, REPAIR_CASES, RUNTIME_MESSAGES, STEP_CASES } from "./step-budget.fixtures.ts";

describe("STEP_BUDGETS", () => {
  for (const c of STEP_CASES) {
    it(`keeps the figures of each dev step crew, one level of children for each, the reviewer or the auditor: ${c.step}`, () => {
      // Arrange
      const { step } = c;

      // Act
      const budget = STEP_BUDGETS[step];

      // Assert
      deepStrictEqual(budget, c.budget);
    });
  }
});

describe("repairBudget", () => {
  for (const c of REPAIR_CASES) {
    it(`gives a repair the budget of the step that runs the charter, with no child of its own: ${c.step}`, () => {
      // Arrange
      const { step } = c;

      // Act
      const budget = repairBudget(step);

      // Assert
      deepStrictEqual(budget, c.budget);
    });
  }
});

describe("readBudgetExhausted", () => {
  it("reads the error's own dimension", () => {
    // Arrange
    const error = budgetError("wallTime");

    // Act
    const dimension = readBudgetExhausted(error);

    // Assert
    strictEqual(dimension, "wallTime");
  });

  for (const c of RUNTIME_MESSAGES) {
    it(`reads each of the runtime's messages: ${c.name}`, () => {
      // Arrange
      const { failure } = c;

      // Act
      const dimension = readBudgetExhausted(failure);

      // Assert
      strictEqual(dimension, c.dimension);
    });
  }

  for (const c of OTHER_FAILURES) {
    it(`is null for any other failure: ${c.name}`, () => {
      // Arrange
      const { failure } = c;

      // Act
      const dimension = readBudgetExhausted(failure);

      // Assert
      strictEqual(dimension, null);
    });
  }
});

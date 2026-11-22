// The budget of a /dev-implement run. Run:
//   node --test tests/crews/dev-implement/domain/implement-budget.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { CLOSE_BUDGET, implementBudget, STEP_TOOL_CALLS, stepsToSize } from "../../../../src/crews/dev-implement/domain/implement-budget.ts";
import { BUDGET_INPUTS, STEPS_CASES } from "./implement-budget.fixtures.ts";
import { assertRuntimeBudget } from "../../../support/assertions/budget.ts";

describe("the implement budgets the runtime reads", () => {
  for (const c of BUDGET_INPUTS) {
    it(`holds only limits of 1 or more, which the runtime accepts (Orkeon #436): ${c.name}`, () => {
      // Arrange
      const { input } = c;

      // Act
      const budget = implementBudget(input);

      // Assert
      assertRuntimeBudget(budget, c.name);
    });
  }
});

describe("implementBudget", () => {
  it("sizes to three steps by default", () => {
    // Arrange
    const input = {};

    // Act
    const budget = implementBudget(input);

    // Assert
    deepStrictEqual(budget, { toolCalls: 370, wallTime: 9900, contextTokens: 450_000 });
  });

  it("sizes to the steps it is given", () => {
    // Arrange
    const input = { steps: 1 };

    // Act
    const budget = implementBudget(input);

    // Assert
    strictEqual(budget.toolCalls, 150);
  });

  it("fits both roles' iterations and the re-ask in one step", () => {
    // Arrange
    const needed = 101;

    // Act
    const room = STEP_TOOL_CALLS;

    // Assert
    strictEqual(room >= needed, true);
  });

  it("gives the close its own budget", () => {
    // Arrange
    const input = { close: true, steps: 9 };

    // Act
    const budget = implementBudget(input);

    // Assert
    deepStrictEqual(budget, CLOSE_BUDGET);
  });
});

describe("stepsToSize", () => {
  for (const c of STEPS_CASES) {
    it(c.name, () => {
      // Arrange
      const { value } = c;

      // Act
      const steps = stepsToSize(value);

      // Assert
      strictEqual(steps, c.expected);
    });
  }
});

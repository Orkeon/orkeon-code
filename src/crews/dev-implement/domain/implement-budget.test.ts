// The budget of a /dev-implement run. Run:
//   node --test src/crews/dev-implement/domain/implement-budget.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { CLOSE_BUDGET, implementBudget, STEP_TOOL_CALLS, stepsToSize } from "./implement-budget.ts";

describe("implementBudget", () => {
  it("sizes to the steps, three by default", () => {
    deepStrictEqual(implementBudget({}), { toolCalls: 370, wallTime: 9900, tokens: 450_000, delegationDepth: 0 });
    strictEqual(implementBudget({ steps: 1 }).toolCalls, 150);
    strictEqual(STEP_TOOL_CALLS >= 101, true); // both roles' iterations and the re-ask fit in one step
  });
  it("caps the steps, and gives the close its own budget", () => {
    strictEqual(stepsToSize(40), 12);
    strictEqual(stepsToSize(0), 1);
    strictEqual(stepsToSize("5"), 3);
    deepStrictEqual(implementBudget({ close: true, steps: 9 }), CLOSE_BUDGET);
  });
});

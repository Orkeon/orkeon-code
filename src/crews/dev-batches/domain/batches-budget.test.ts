// The budget of a /dev-batches run and of one batch of a parallel wave. Run:
//   node --test src/crews/dev-batches/domain/batches-budget.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { BATCHES_BUDGET, WAVE_MARGIN_SECONDS, batchLimits, driverBudget } from "./batches-budget.ts";
import { CLOSE_BUDGET, MAX_STEPS, implementBudget } from "../../dev-implement/domain/implement-budget.ts";
import { STEP_BUDGETS } from "../../../shared/domain/dev/step-budget.ts";

describe("batchLimits", () => {
  it("sums the implement run sized to the steps, the audit and the close: tool calls and wall time", () => {
    const steps = 3;
    deepStrictEqual(batchLimits(steps), {
      toolCalls: implementBudget({ steps }).toolCalls + STEP_BUDGETS["dev-verify"].toolCalls + CLOSE_BUDGET.toolCalls,
      wallTime: implementBudget({ steps }).wallTime + STEP_BUDGETS["dev-verify"].wallTime + CLOSE_BUDGET.wallTime,
    });
  });
});

describe("driverBudget", () => {
  it("is BATCHES_BUDGET for one batch at a time", () => {
    deepStrictEqual(driverBudget(1), BATCHES_BUDGET);
    deepStrictEqual(driverBudget(undefined), BATCHES_BUDGET);
  });

  it("adds the largest batch's wall time and a margin above 1, not a sum; its own calls and depth unchanged", () => {
    const b = driverBudget(3);
    strictEqual(b.wallTime, BATCHES_BUDGET.wallTime + batchLimits(MAX_STEPS).wallTime + WAVE_MARGIN_SECONDS);
    strictEqual(b.toolCalls, BATCHES_BUDGET.toolCalls);
    strictEqual(b.tokens, BATCHES_BUDGET.tokens);
    strictEqual(b.delegationDepth, 0);
  });
});

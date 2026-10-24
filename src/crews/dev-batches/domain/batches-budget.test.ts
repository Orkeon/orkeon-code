// The budget of a /dev-batches run and of one batch of a parallel wave. Run:
//   node --test src/crews/dev-batches/domain/batches-budget.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { BATCHES_BUDGET, WAVE_BATCH_CALLS, WAVE_MARGIN_SECONDS, WAVE_REVIEW_CALLS, batchLimits, driverBudget } from "./batches-budget.ts";
import { CLOSE_BUDGET, MAX_STEPS, implementBudget } from "../../dev-implement/domain/implement-budget.ts";
import { STEP_BUDGETS, TOKENS_PER_CALL } from "../../../shared/domain/dev/step-budget.ts";

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

  it("adds the largest batch's wall time and a margin above 1, not a sum; its depth unchanged", () => {
    const b = driverBudget(3);
    strictEqual(b.wallTime, BATCHES_BUDGET.wallTime + batchLimits(MAX_STEPS).wallTime + WAVE_MARGIN_SECONDS);
    strictEqual(b.delegationDepth, 0);
  });

  it("grows its tool calls and tokens with each batch of a wave: a review and the batch's git and file calls", () => {
    for (const n of [2, 3, 4]) {
      const b = driverBudget(n);
      strictEqual(b.toolCalls, BATCHES_BUDGET.toolCalls + n * (WAVE_REVIEW_CALLS + WAVE_BATCH_CALLS), `${n}`);
      strictEqual(b.tokens, BATCHES_BUDGET.tokens + n * (WAVE_REVIEW_CALLS + WAVE_BATCH_CALLS) * TOKENS_PER_CALL, `${n}`);
    }
    // A wave of 4: four reviews of about 60 calls and about 16 calls a batch, past the 40 of the run's own.
    ok(driverBudget(4).toolCalls >= 40 + 4 * (60 + 16));
  });
});

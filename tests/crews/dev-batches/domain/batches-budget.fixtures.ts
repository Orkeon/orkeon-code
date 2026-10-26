// Sizes and expected limits for the batches budget tests.
import { CLOSE_BUDGET, MAX_STEPS, implementBudget } from "../../../../src/crews/dev-implement/domain/implement-budget.ts";
import { STEP_BUDGETS } from "../../../../src/shared/domain/dev/step-budget.ts";
import type { BatchLimits } from "../../../../src/crews/dev-batches/domain/batches-budget.ts";

/** The limits of a batch of `steps` steps: the implement run sized to them, the audit and the close, summed. */
export function expectedBatchLimits(steps: number): BatchLimits {
  return {
    toolCalls: implementBudget({ steps }).toolCalls + STEP_BUDGETS["dev-verify"].toolCalls + CLOSE_BUDGET.toolCalls,
    wallTime: implementBudget({ steps }).wallTime + STEP_BUDGETS["dev-verify"].wallTime + CLOSE_BUDGET.wallTime,
    tokens: implementBudget({ steps }).tokens + STEP_BUDGETS["dev-verify"].tokens + CLOSE_BUDGET.tokens,
  };
}

/** The step counts a batch may be sized with, the unknown one included. */
export const STEP_COUNTS: readonly { name: string; steps: number | undefined }[] = [
  { name: "one step", steps: 1 },
  { name: "the most steps", steps: MAX_STEPS },
  { name: "an unknown step count", steps: undefined },
];

/** A concurrency that runs one batch at a time. */
export const ONE_AT_A_TIME: readonly { name: string; concurrency: number | undefined }[] = [
  { name: "is BATCHES_BUDGET for a concurrency of 1", concurrency: 1 },
  { name: "is BATCHES_BUDGET for no concurrency given", concurrency: undefined },
];

/** Wave sizes the driver's tool calls and tokens grow with. */
export const WAVE_SIZES: readonly number[] = [2, 3, 4];

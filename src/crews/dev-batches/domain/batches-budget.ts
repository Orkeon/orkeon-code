// The budget of one /dev-batches run (temp/02 G-29): code reads the plan, its sheets, verdicts and log,
// runs a few git commands, and at most one review of the next batch (REVIEWER_CHARTER's 20 iterations,
// about 3 tool calls each, inline: no child) plus its extract call; the close of the plan adds a push and
// the pull request. 60 + 40 file and git calls = 100; 120 leaves a margin. Pure.
//
// A parallel wave (`concurrency` above 1): each batch agent is run by `crew.runAgent`, which gives it no budget of
// the runtime's and none a script can pass (runtime issue Orkeon/orkeon#189), so a batch is bounded in code
// (batchLimits: its tool calls by the spend guard, its wall time by runAgent's timeout) and draws nothing from the
// driver's. The driver waits for the wave: its wall time adds the largest batch's and a margin, not their sum.
// No batch spawns and runAgent checks no depth: delegationDepth stays 0.
import type { StepBudget } from "../../../shared/domain/dev/step-budget.ts";
import { STEP_BUDGETS } from "../../../shared/domain/dev/step-budget.ts";
import { CLOSE_BUDGET, MAX_STEPS, implementBudget } from "../../dev-implement/domain/implement-budget.ts";

export const BATCHES_BUDGET: StepBudget = { toolCalls: 120, wallTime: 1800, tokens: 200_000, delegationDepth: 0 };

/** The driver's time beyond its own and the longest batch's: the harvest, the merges, the removals. */
export const WAVE_MARGIN_SECONDS = 600;

export interface BatchLimits { toolCalls: number; wallTime: number }

/** One batch of a wave: its implement run sized to `steps`, its audit and its close, summed. */
export function batchLimits(steps: unknown): BatchLimits {
  const implement = implementBudget({ steps });
  const verify = STEP_BUDGETS["dev-verify"];
  return {
    toolCalls: implement.toolCalls + verify.toolCalls + CLOSE_BUDGET.toolCalls,
    wallTime: implement.wallTime + verify.wallTime + CLOSE_BUDGET.wallTime,
  };
}

/** The driver's budget for a run of `concurrency` batches at once (the steps of a wave's batches are not known when
 *  the crew is built: the largest a batch can be sized to counts). */
export function driverBudget(concurrency: unknown): StepBudget {
  const n = typeof concurrency === "number" ? concurrency : Number(concurrency);
  if (!(Number.isFinite(n) && n > 1)) return BATCHES_BUDGET;
  return { ...BATCHES_BUDGET, wallTime: BATCHES_BUDGET.wallTime + batchLimits(MAX_STEPS).wallTime + WAVE_MARGIN_SECONDS };
}

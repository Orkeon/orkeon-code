// The budget of one /dev-batches run (temp/02 G-29): code reads the plan, its sheets, verdicts and log,
// runs a few git commands, and at most one review of the next batch (REVIEWER_CHARTER's 20 iterations,
// about 3 tool calls each, inline: no child) plus its extract call; the close of the plan adds a push and
// the pull request. 60 + 40 file and git calls = 100; 120 leaves a margin. Pure.
import type { StepBudget } from "../../../shared/domain/dev/step-budget.ts";

export const BATCHES_BUDGET: StepBudget = { toolCalls: 120, wallTime: 1800, tokens: 200_000, delegationDepth: 0 };

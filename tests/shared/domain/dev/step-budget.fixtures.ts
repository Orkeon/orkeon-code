// The budgets expected of each dev step crew, and the failures readBudgetExhausted reads.
import type { BudgetDimension, StepBudget } from "../../../../src/shared/domain/dev/step-budget.ts";

type Step = "dev-verify" | "dev-plan" | "dev-spec" | "dev-change";

export interface StepCase {
  step: Step;
  budget: StepBudget;
}

/** One level of children for each step: the reviewer or the auditor. */
export const STEP_CASES: readonly StepCase[] = [
  { step: "dev-verify", budget: { toolCalls: 200, wallTime: 3600, tokens: 700_000, delegationDepth: 1 } },
  // The reviewer child's calls count against dev-plan's: its tokens follow its 240 calls, as dev-verify's follow its 200.
  { step: "dev-plan", budget: { toolCalls: 240, wallTime: 1800, tokens: 840_000, delegationDepth: 1 } },
  // The wall time of a spec or a brief counts the person's answers to its questions.
  { step: "dev-spec", budget: { toolCalls: 200, wallTime: 3600, tokens: 700_000, delegationDepth: 1 } },
  { step: "dev-change", budget: { toolCalls: 200, wallTime: 3600, tokens: 700_000, delegationDepth: 1 } },
];

/** A repair runs with the step's budget and no child of its own. */
export const REPAIR_CASES: readonly StepCase[] = [
  { step: "dev-verify", budget: { toolCalls: 200, wallTime: 3600, tokens: 700_000, delegationDepth: 0 } },
  { step: "dev-plan", budget: { toolCalls: 240, wallTime: 1800, tokens: 840_000, delegationDepth: 0 } },
];

/** A BudgetExhaustedError carrying its dimension. */
export function budgetError(dimension: BudgetDimension): Error {
  return Object.assign(new Error("spent"), { name: "BudgetExhaustedError", dimension });
}

export interface MessageCase {
  name: string;
  failure: unknown;
  dimension: BudgetDimension | null;
}

/** Each of the runtime's messages, as a string or an error. */
export const RUNTIME_MESSAGES: readonly MessageCase[] = [
  { name: "too many tool calls", failure: "Agent exceeded 200 tool calls.", dimension: "toolCalls" },
  { name: "the tool-call budget", failure: "Tool-call budget exhausted (200/200).", dimension: "toolCalls" },
  { name: "the token budget, in an error", failure: new Error("Token budget exhausted (400100/400000)."), dimension: "tokens" },
  {
    name: "the token budget, as Orkeon #218 words it",
    failure: new Error("Token budget exhausted: 1500210 tokens sent and received over 41 calls (limit 1500000)"),
    dimension: "tokens",
  },
  { name: "the wall time", failure: "Wall time exceeded (0:30:00 >= 0:30:00).", dimension: "wallTime" },
  { name: "the delegation depth", failure: "Delegation depth 3 exceeds max 2.", dimension: "delegationDepth" },
  { name: "too many spawned agents", failure: "Agent exceeded 4 spawned sub-agents.", dimension: "spawnedAgents" },
];

/** Failures that are no spent budget. */
export const OTHER_FAILURES: readonly MessageCase[] = [
  { name: "a provider error", failure: new Error("provider down"), dimension: null },
  { name: "an object with an unknown dimension", failure: { dimension: "patience" }, dimension: null },
  { name: "undefined", failure: undefined, dimension: null },
];

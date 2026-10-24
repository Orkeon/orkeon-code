// The budget of each dev step crew, sized to one unit (temp/02 G-29: never one long turn, a chain
// of short steps over a state file), and the reader of the runtime's refusal when one is spent. A
// spent budget throws BudgetExhaustedError with its `dimension`; once an agent's act turned it into
// a plain failure, only its message is left, and the runtime's messages name the dimension
// (AgentExecutionBudget.cs). Pure.

export type BudgetDimension = "toolCalls" | "delegationDepth" | "wallTime" | "tokens" | "spawnedAgents";

export interface StepBudget {
  toolCalls: number;
  /** Seconds. */
  wallTime: number;
  tokens: number;
  delegationDepth: number;
}

/**
 * dev-verify: under full, the build (900 s), the whole suite (900 s) and three validations (300 s
 * each), whether code or run_validation runs them, plus the auditor's own time. dev-plan: the
 * inventory's index queries, the planner and the reviewer.
 */
export const STEP_BUDGETS: Readonly<Record<"dev-verify" | "dev-plan", StepBudget>> = {
  "dev-verify": { toolCalls: 200, wallTime: 3600, tokens: 300_000, delegationDepth: 0 },
  "dev-plan": { toolCalls: 240, wallTime: 1800, tokens: 400_000, delegationDepth: 0 },
};

const DIMENSIONS: readonly BudgetDimension[] = ["toolCalls", "delegationDepth", "wallTime", "tokens", "spawnedAgents"];

/** The runtime's messages, by dimension. */
const MESSAGES: ReadonlyArray<[BudgetDimension, RegExp]> = [
  ["toolCalls", /exceeded \d+ tool calls|tool-call budget exhausted/i],
  ["tokens", /token budget exhausted/i],
  ["wallTime", /wall time exceeded/i],
  ["delegationDepth", /delegation depth \d+ exceeds max/i],
  ["spawnedAgents", /exceeded \d+ spawned sub-agents/i],
];

/** The dimension a spent budget names: the error's own `dimension`, else its message; null for any other failure. */
export function readBudgetExhausted(failure: unknown): BudgetDimension | null {
  if (failure !== null && typeof failure === "object") {
    const dimension = (failure as { dimension?: unknown }).dimension;
    if (typeof dimension === "string" && (DIMENSIONS as readonly string[]).includes(dimension)) {
      return dimension as BudgetDimension;
    }
  }
  const text = failure instanceof Error ? failure.message : typeof failure === "string" ? failure : "";
  return MESSAGES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

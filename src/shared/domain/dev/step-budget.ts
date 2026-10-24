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
 * each), whether code or run_validation runs them, plus the auditor's own time. Its tokens follow its
 * tool calls: a live audit of a 3-file batch spent 307 528 tokens over 92 calls (about 3 300 a call, each
 * turn resending the context), so 200 calls ask for about 670 000; 700 000 leaves the tool calls the
 * limit an audit meets first. dev-plan: the
 * inventory's index queries, the planner and the reviewer. delegationDepth 1: the reviewer and the
 * auditor run as background children of the step's agent (A-3), one level down, never deeper. dev-spec and
 * dev-change: the inventory (about 40 index calls), three extract calls, the reproduction (600 s at most) and one
 * review of 20 iterations, inline (no child); the wall time counts the time a person takes to answer the
 * questions, hence an hour.
 */
export const STEP_BUDGETS: Readonly<Record<"dev-verify" | "dev-plan" | "dev-spec" | "dev-change", StepBudget>> = {
  "dev-verify": { toolCalls: 200, wallTime: 3600, tokens: 700_000, delegationDepth: 1 },
  "dev-plan": { toolCalls: 240, wallTime: 1800, tokens: 400_000, delegationDepth: 1 },
  "dev-spec": { toolCalls: 200, wallTime: 3600, tokens: 400_000, delegationDepth: 0 },
  "dev-change": { toolCalls: 200, wallTime: 3600, tokens: 400_000, delegationDepth: 0 },
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

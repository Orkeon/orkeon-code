// A model call the host's provider failed. Orkeon does not throw then: `act`
// resolves its `output`, and `complete` its text, to the marker
// `<undefined-llm:<the provider's error>>` (also what a host without a provider
// echoes). Read as an answer, the marker would be stored, summarised, written or
// committed as if the model had said it, so the Llm adapter throws this failure
// instead. The same adapter throws a BudgetExhaustedAnswer when an act resolves
// with `budgetExhausted` (Orkeon #218: the token budget ran out, the act made one
// last call without tools and resolved with that answer): the answer rides on the
// error, so no caller reads a cut-short wrap-up as a finished answer, and the
// readers of a spent budget (shared/domain/dev/step-budget.ts) see the `tokens`
// dimension as they did when the runtime rejected. A call a decision stage of
// the host blocked is no failure of the provider: the runtime rejects it with a
// DecisionBlockedError (Orkeon #269), which decisionBlockOf reads. Pure, no IO.
import { BUDGET_EXHAUSTED_MESSAGE, blockedByDecisionProfile, matchesTheRisk, modelCallFailed } from "./messages.ts";

const MARKER = /^<undefined-llm:([\s\S]*)>$/;

/** The longest provider error a failure carries: a host without a provider echoes the whole prompt. */
const MAX_DETAIL = 300;

/** The error a failed model call throws, told apart by its `name`. */
export interface LlmFailure extends Error {
  name: "LlmFailure";
  /** The provider's error, as the marker carried it (cut at MAX_DETAIL characters). */
  detail: string;
}

/** The failure a model's text stands for, or null when the text is an answer. */
export function llmFailureOf(text: unknown): LlmFailure | null {
  const m = typeof text === "string" ? MARKER.exec(text) : null;
  if (!m) return null;
  const detail = m[1].length > MAX_DETAIL ? `${m[1].slice(0, MAX_DETAIL)}…` : m[1];
  // A plain Error with a name rather than a subclass: subclassing Error is not
  // something the bundles rely on anywhere else, in Jint or in Node.
  const failure = new Error(modelCallFailed(detail)) as LlmFailure;
  failure.name = "LlmFailure";
  failure.detail = detail;
  return failure;
}

/** A call a decision stage of the host blocked (a decision profile, `llm.profile`): which stage, of which profile,
 *  the risk a guard matched, why. */
export interface DecisionBlock {
  readonly stage: string;
  readonly profile: string;
  /** The risk a guard matched (`prompt_injection`); null for another stage. */
  readonly risk: string | null;
  /** Why the stage blocked the call; null when the stage gave no reason. */
  readonly reason: string | null;
}

/** The `errorType` of the runtime's DecisionBlockedError (Orkeon #269): `complete`, `chat`, `extract`, `decide`, `act`
 *  and a `stream` iteration reject with it when a stage blocks the call, a fail-closed stage that failed included. */
const DECISION_BLOCKED = "DecisionBlocked";

function textField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The block a DecisionBlockedError carries; null for any other error (an LlmFailure, a rate limit) or value. */
export function decisionBlockOf(error: unknown): DecisionBlock | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { errorType?: unknown; profile?: unknown; stage?: unknown; risk?: unknown; reason?: unknown };
  if (e.errorType !== DECISION_BLOCKED) return null;
  return {
    stage: textField(e.stage) ?? "unknown",
    profile: textField(e.profile) ?? "unknown",
    risk: textField(e.risk),
    reason: textField(e.reason),
  };
}

/** What the user reads for a blocked request: a decision, not an outage, and what to do about it. */
export function decisionBlockText(block: DecisionBlock): string {
  const why = block.reason ?? (block.risk === null ? null : matchesTheRisk(block.risk));
  return blockedByDecisionProfile(block.profile, block.stage, why);
}

/** The error an act whose token budget ran out throws: the wrap-up answer the model gave in its last call, and the
 *  `tokens` dimension, as readBudgetExhausted reads it off a BudgetExhaustedError of the runtime. */
export interface BudgetExhaustedAnswer extends Error {
  name: "BudgetExhaustedError";
  dimension: "tokens";
  /** The model's last answer, made without tools once the budget was spent: cut short, never parsed as an answer. */
  answer: string;
}


/** The error carrying the wrap-up `answer` of an act that resolved with `budgetExhausted`. */
export function budgetExhaustedAnswer(answer: string): BudgetExhaustedAnswer {
  const failure = new Error(BUDGET_EXHAUSTED_MESSAGE) as BudgetExhaustedAnswer;
  failure.name = "BudgetExhaustedError";
  failure.dimension = "tokens";
  failure.answer = answer;
  return failure;
}

/** The failure as a BudgetExhaustedAnswer, or null for any other value: a BudgetExhaustedError of the runtime's own
 *  carries no answer and is not one. */
export function budgetExhaustedAnswerOf(failure: unknown): BudgetExhaustedAnswer | null {
  if (!(failure instanceof Error) || failure.name !== "BudgetExhaustedError") return null;
  const answer = (failure as { answer?: unknown }).answer;
  return typeof answer === "string" ? failure as BudgetExhaustedAnswer : null;
}

// B-12 — what the advisor crew asks, and about what. Pure, no IO.
//
// Baseline 04 §/advisor: an advisor model used for "secondary review of agent
// outputs". So the subject is the session's last exchange, and the value of the
// exercise rests entirely on the reviewer being a DIFFERENT model — a model asked
// to find fault with its own answer mostly agrees with itself. The crew therefore
// applies `advisor.model` as a per-call override; when none is set it says so and
// the caller knows the verdict is a self-review.

export interface Exchange {
  /** The request that produced the answer; "" when the buffer starts mid-thread. */
  request: string;
  /** The answer under review. */
  answer: string;
}

/** Nothing to review — an empty buffer, or a buffer with no assistant turn yet. */
export const NOTHING_TO_REVIEW = "";

/**
 * The last user→assistant exchange in the buffer.
 *
 * Walks backwards to the last assistant turn, then backwards again for the user
 * turn that preceded it. Taking the last user message instead would attach the
 * answer to whatever the operator typed most recently — which, after a `/`-command
 * turn or an interrupted request, is not the question that was answered.
 */
export function lastExchange(
  messages: ReadonlyArray<{ role?: string; content?: string }>,
): Exchange | null {
  const list = messages ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (String(list[i]?.role ?? "").toLowerCase() !== "assistant") continue;
    const answer = String(list[i]?.content ?? "").trim();
    if (answer.length === 0) continue;
    let request = NOTHING_TO_REVIEW;
    for (let j = i - 1; j >= 0; j--) {
      if (String(list[j]?.role ?? "").toLowerCase() === "user") {
        request = String(list[j]?.content ?? "").trim();
        break;
      }
    }
    return { request, answer };
  }
  return null;
}

/** Per-field truncation budget — a long answer must not crowd out the request. */
export const MAX_REQUEST_CHARS = 4_000;
export const MAX_ANSWER_CHARS = 12_000;

export function clip(text: string, max: number): string {
  const t = String(text ?? "");
  return t.length <= max ? t : `${t.slice(0, max)}\n…[truncated ${t.length - max} chars]`;
}

/**
 * The advisory prompt.
 *
 * Asks for disagreement first and explicitly permits "nothing to add", because an
 * advisor that always finds three problems is an advisor whose findings carry no
 * information. Ordered worst-first so a truncated reply still leads with what matters.
 */
export function buildAdvicePrompt(exchange: Exchange): string {
  const request = exchange.request.length > 0
    ? clip(exchange.request, MAX_REQUEST_CHARS)
    : "(the request is not in the buffer — judge the answer on its own terms)";

  return [
    "You are a second opinion on another agent's answer. You did not write it and you owe it nothing.",
    "",
    "Report, worst first: anything factually wrong, any claim made without evidence, anything the",
    "request asked for and the answer skipped. Then, briefly, what you would have done differently.",
    "If the answer is sound, say so in one line and stop — inventing objections to look thorough is",
    "the one failure mode that makes this exercise worthless.",
    "",
    "## The request",
    request,
    "",
    "## The answer under review",
    clip(exchange.answer, MAX_ANSWER_CHARS),
  ].join("\n");
}

/** Header line for the advice, naming the reviewing model and its weakness. */
export function describeAdvisor(advisorModel: string): string {
  return advisorModel.length > 0
    ? `second opinion from '${advisorModel}'`
    : "second opinion from the SESSION's own model — no advisor.model is set, so this is a " +
      "self-review and worth much less. Set one with /advisor <model>.";
}

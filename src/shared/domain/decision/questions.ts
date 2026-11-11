// The questions asked of the host's decision model and the answers read back from it. A decision model answers
// typed questions about a state with calibrated numbers: one option among described ones, a level on a scale, the
// probability of a yes. Which model answers (the host's settings name it) is no concern of this module.

/** One option among described ones: `criteria` maps each option to what it means. */
export interface ChoiceDecision {
  type: "choice";
  criteria: Readonly<Record<string, string>>;
  instructions?: string;
}

/** A level on a scale: `criteria` lists the levels, lowest first. */
export interface ScoreDecision {
  type: "score";
  criteria: readonly string[];
  instructions?: string;
}

/** A yes or a no: `criteria.true` says what yes means. */
export interface YesNoDecision {
  type: "noul";
  criteria: { readonly true: string };
  instructions?: string;
}

export type DecisionQuestion = ChoiceDecision | ScoreDecision | YesNoDecision;

/** The questions of one request, by name. */
export type DecisionQuestions = Readonly<Record<string, DecisionQuestion>>;

export type DecisionAnswer =
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number }
  | { type: "noul"; probability: number };

/** The answers of one request, by the name of their question. */
export type DecisionAnswers = Record<string, DecisionAnswer>;

/** A yes/no question: what yes means, and what is judged when it needs saying. */
export function yesNo(yes: string, instructions?: string): YesNoDecision {
  return instructions === undefined ? { type: "noul", criteria: { true: yes } } : { type: "noul", criteria: { true: yes }, instructions };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** A number of [0, 1], or null. */
function share(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function shares(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [option, raw] of Object.entries(record(value) ?? {})) {
    const p = share(raw);
    if (p !== null) out[option] = p;
  }
  return out;
}

function answerOf(question: DecisionQuestion, raw: unknown): DecisionAnswer | null {
  const answer = record(raw);
  if (answer === null) return null;
  if (question.type === "noul") {
    const probability = share(answer.noul);
    return probability === null ? null : { type: "noul", probability };
  }
  const confidence = share(answer.confidence);
  if (confidence === null) return null;
  if (question.type === "score") {
    return typeof answer.score === "number" && Number.isFinite(answer.score) ? { type: "score", score: answer.score, confidence } : null;
  }
  const choice = answer.choice;
  if (typeof choice !== "string" || !Object.hasOwn(question.criteria, choice)) return null;
  return { type: "choice", choice, confidence, probabilities: shares(answer.probabilities) };
}

/**
 * The answers of a decision model to `questions`, read from what it returned (an object by question name, or its
 * JSON). Null unless every question has an answer of its own kind: a choice among the options asked, a score, a
 * probability of [0, 1]. A caller that gets null does what it did without a decision model.
 */
export function parseDecisionAnswers(questions: DecisionQuestions, raw: unknown): DecisionAnswers | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const given = record(value);
  if (given === null) return null;
  const answers: DecisionAnswers = {};
  for (const [name, question] of Object.entries(questions)) {
    const answer = answerOf(question, given[name]);
    if (answer === null) return null;
    answers[name] = answer;
  }
  return answers;
}

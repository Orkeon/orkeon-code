// The cases of shared/domain/decision/questions.ts: what a decision model returned, and what is read from it.
import type { DecisionAnswers, DecisionQuestions } from "../../../../src/shared/domain/decision/questions.ts";

export const QUESTIONS: DecisionQuestions = {
  keep: { type: "noul", criteria: { true: "The output is still needed" } },
  profile: { type: "choice", criteria: { small: "A lookup", large: "A change across modules" } },
  effort: { type: "score", criteria: ["low", "medium", "high"] },
};

const RETURNED = {
  keep: { type: "noul", noul: 0.82 },
  profile: { type: "choice", choice: "large", confidence: 0.7, probabilities: { small: 0.3, large: 0.7 } },
  effort: { type: "score", score: 1, confidence: 0.6, legend: {}, probabilities: { low: 0.1, medium: 0.6, high: 0.3 } },
};

const READ: DecisionAnswers = {
  keep: { type: "noul", probability: 0.82 },
  profile: { type: "choice", choice: "large", confidence: 0.7, probabilities: { small: 0.3, large: 0.7 } },
  effort: { type: "score", score: 1, confidence: 0.6 },
};

export const ANSWER_CASES: readonly { readonly name: string; readonly raw: unknown; readonly expected: DecisionAnswers | null }[] = [
  { name: "reads a yes/no, a choice and a score by the name of their question", raw: RETURNED, expected: READ },
  { name: "reads the same answers from their JSON", raw: JSON.stringify(RETURNED), expected: READ },
  { name: "reads nothing from a text that is not JSON", raw: "the model is busy", expected: null },
  { name: "reads nothing from a list", raw: [RETURNED], expected: null },
  { name: "reads nothing when a question has no answer", raw: { keep: RETURNED.keep, profile: RETURNED.profile }, expected: null },
  { name: "reads nothing from a probability above 1", raw: { ...RETURNED, keep: { noul: 1.4 } }, expected: null },
  { name: "reads nothing from a probability that is not a number", raw: { ...RETURNED, keep: { noul: "0.8" } }, expected: null },
  {
    name: "reads nothing from a choice outside the options asked",
    raw: { ...RETURNED, profile: { choice: "huge", confidence: 0.9, probabilities: {} } }, expected: null,
  },
  { name: "reads nothing from a choice without its confidence", raw: { ...RETURNED, profile: { choice: "large" } }, expected: null },
  { name: "reads nothing from a score that is not a number", raw: { ...RETURNED, effort: { score: "high", confidence: 0.6 } }, expected: null },
  {
    name: "drops the probability of an option that is not a share",
    raw: { ...RETURNED, profile: { choice: "large", confidence: 0.7, probabilities: { small: "low", large: 0.7 } } },
    expected: { ...READ, profile: { type: "choice", choice: "large", confidence: 0.7, probabilities: { large: 0.7 } } },
  },
];

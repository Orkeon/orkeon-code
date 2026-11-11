// The decision port: the host's decision model, asked typed questions about a state.
// Types only, re-exported by ../ports.ts.

import type { DecisionAnswers, DecisionQuestions } from "../../domain/decision/questions.ts";

/** The decision model the host's settings configure (`Orkeon:Decision`), whichever provider serves it. A use case
 *  that asks it keeps working without it: no model, a failed call and an unreadable answer are all `null`. */
export interface DecisionModel {
  /** Whether the host has a decision model to ask. */
  available(): boolean;
  /** Ask `questions` about `state` (a text, or any JSON value) in one request; resolves to every answer by the
   *  name of its question, or to null. Never throws. */
  ask(state: unknown, questions: DecisionQuestions): Promise<DecisionAnswers | null>;
}

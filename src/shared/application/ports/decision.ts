// The decision ports: the host's decision model, asked typed questions about a state, and the runtime's System One
// pick of a profile. Types only, re-exported by ../ports.ts.

import type { DecisionAnswers, DecisionQuestions } from "../../domain/decision/questions.ts";
import type { RouteReason } from "../../domain/agents/model-route.ts";

/** What a profile pick is given besides its request: profiles the host declares, cheapest first, and the bounds. */
export interface ProfilePickOptions {
  /** Two or more profiles, each once. */
  ladder: readonly string[];
  /** The lowest rung the answer may be; a rung of the ladder. */
  floor?: string;
  /** The highest rung the answer may be; a rung of the ladder. */
  ceiling?: string;
  /** What stands without a pick; left out, the host's default model. */
  fallback?: string;
}

/** The answer of a profile pick. */
export interface ProfilePick {
  /** The profile to use: the model's pick held between the floor and the ceiling, else the fallback; null: the host's
   *  default model. */
  value: string | null;
  reason: RouteReason;
  /** What the decision model answered, when it answered one of the rungs; else null. */
  picked: string | null;
  /** The probability the answer gave `picked`; else null. */
  probability: number | null;
}

/** The runtime's System One pick of a profile (Orkeon #460, experimental ORKEXP008): the decision model reads the
 *  request and picks a rung; under its bar (0.6) or without an answer the fallback stands. */
export interface ProfilePicker {
  /** Never throws: a host without the pick, an option it refuses and a reply that does not read are all null. */
  pick(request: string, options: ProfilePickOptions): Promise<ProfilePick | null>;
}

/** The decision model the host's settings configure (`Orkeon:Decision`), whichever provider serves it. A use case
 *  that asks it keeps working without it: no model, a failed call and an unreadable answer are all `null`. */
export interface DecisionModel {
  /** Whether the host has a decision model to ask. */
  available(): boolean;
  /** Ask `questions` about `state` (a text, or any JSON value) in one request; resolves to every answer by the
   *  name of its question, or to null. Never throws. */
  ask(state: unknown, questions: DecisionQuestions): Promise<DecisionAnswers | null>;
}

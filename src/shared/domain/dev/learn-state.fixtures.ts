// Decisions, states and texts the /dev-learn state is tested on.
import { withDecision } from "./learn-state.ts";
import type { DecisionRecord, LearnState } from "./learn-state.ts";

export const ACCEPT: DecisionRecord = { motif: "3f2a9c1e", decision: "accepted", date: "2026-10-22", axis: "Test", title: "Refusal paths go untested" };
export const REFUSE: DecisionRecord = { motif: "77b0d2aa", decision: "refused", date: "2026-10-23", axis: "Plan", title: "Batches too wide" };

export interface ShapeCase {
  text: string;
  field: string;
}

/** Each wrong shape and the field it names. */
export const WRONG_SHAPES: readonly ShapeCase[] = [
  { text: "[]", field: "the top level" },
  { text: "null", field: "the top level" },
  { text: `{"version":2,"treated":[],"decisions":[]}`, field: "version" },
  { text: `{"treated":[],"decisions":[]}`, field: "version" },
  { text: `{"version":1,"treated":3,"decisions":[]}`, field: "treated" },
  { text: `{"version":1,"treated":["a",1],"decisions":[]}`, field: "treated" },
  { text: `{"version":1,"treated":[]}`, field: "decisions" },
  { text: `{"version":1,"treated":[],"decisions":[{"motif":"a"}]}`, field: "decisions[0]" },
  {
    text: `{"version":1,"treated":[],"decisions":[${JSON.stringify(ACCEPT)},${JSON.stringify({ ...REFUSE, decision: "maybe" })}]}`,
    field: "decisions[1]",
  },
];

/** A state with two treated rows and both decisions. */
export function fullState(): LearnState {
  return { version: 1, treated: ["0b1c2d3e4f", "68abc1ec48"], decisions: [ACCEPT, REFUSE] };
}

/** A state with two treated rows, out of order, and no decision. */
export function startState(): LearnState {
  return { version: 1, treated: ["9a8b7c6d5e", "0b1c2d3e4f"], decisions: [] };
}

/** Rows to add: one new twice, one already treated. */
export const ADDED_ROWS: readonly string[] = ["68abc1ec48", "0b1c2d3e4f", "68abc1ec48"];

/** The start state after ACCEPT on the added rows. */
export function acceptedState(): LearnState {
  return withDecision(startState(), ACCEPT, ADDED_ROWS);
}

/** Texts the harness file may hold that are unreadable or of the wrong shape. */
export const UNREADABLE_HARNESS: readonly (string | null)[] = [
  null, "", "{ nope", "[1,2]", "\"text\"", "null", `{"treated":3}`, `{"treated":{"a":1},"refused":"x"}`,
];

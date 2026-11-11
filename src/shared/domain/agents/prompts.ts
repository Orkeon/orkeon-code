// The text an agent reads in the brief of a repair by a new run.

/** What a cut text starts with. */
export const CUT_MARK = "[… the start is left out]\n";
export const repairOpening = (charter: string, id: string): string =>
  `This is a new run of ${charter}, repairing instance ${id} of an ended run: you do not have its context,`;
export const REPAIR_INSTRUCTION =
  "only what follows. Answer the operator's message below, then give the whole report again in the shape the previous brief asked for.";
export const noReport = (state: string, error: string): string => `(none: the instance ${state}${error})`;

// ── Routing a crew to a profile: what the decision model reads ──────────

export const routeStateText = (crew: string, command: string): string =>
  `A coding assistant is about to run its crew '${crew}' for this command of its user:\n${command}`;
const RUNGS = {
  lowest: "The cheapest, fastest model is enough: a lookup, a summary, a mechanical or fully specified task.",
  middle: "A mid-range model fits: more than a mechanical task, less than a design or a change across modules.",
  highest: "The strongest model is needed: a design, a change across several modules, subtle reasoning, a review that must not miss a defect.",
} as const;
export const routeRung = (place: keyof typeof RUNGS): string => RUNGS[place];

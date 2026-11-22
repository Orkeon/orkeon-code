// The text an agent reads in the brief of a repair by a new run.

/** What a cut text starts with. */
export const CUT_MARK = "[… the start is left out]\n";
export const repairOpening = (charter: string, id: string): string =>
  `This is a new run of ${charter}, repairing instance ${id} of an ended run: you do not have its context,`;
export const REPAIR_INSTRUCTION =
  "only what follows. Answer the operator's message below, then give the whole report again in the shape the previous brief asked for.";
export const noReport = (state: string, error: string): string => `(none: the instance ${state}${error})`;

// ── Routing a crew to a profile: the request the runtime's pick reads (it describes the rungs itself) ──────────

export const routeStateText = (crew: string, command: string): string =>
  `A coding assistant is about to run its crew '${crew}' for this command of its user:\n${command}`;

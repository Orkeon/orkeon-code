// The text an agent reads in the brief of a repair by a new run.

/** What a cut text starts with. */
export const CUT_MARK = "[… the start is left out]\n";
export const repairOpening = (charter: string, id: string): string =>
  `This is a new run of ${charter}, repairing instance ${id} of an ended run: you do not have its context,`;
export const REPAIR_INSTRUCTION =
  "only what follows. Answer the operator's message below, then give the whole report again in the shape the previous brief asked for.";
export const noReport = (state: string, error: string): string => `(none: the instance ${state}${error})`;

// The text /tasks hands the model (ADR 0026): the note a repair's brief carries.

/** The note a repair carries when the operator gives none. */
export const DEFAULT_REPAIR_NOTE = "Check your previous report against the brief again and correct what is wrong or missing.";

/** The request of the turn that follows an approved plan. */
export const CARRY_OUT_PLAN =
  "I approve the plan of your last answer. Carry it out now, whole: the session is no longer read-only, so write " +
  "the files and run the commands it names, then report what was done and what was checked.";

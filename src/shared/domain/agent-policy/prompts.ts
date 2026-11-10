// The prompts of shared/domain/agent-policy: the text the model reads (ADR 0026).

/** The permission clause of a read-only mode, and of the others. */
export const READ_ONLY_CLAUSE =
  "Read-only: read and search the project, but MUST NOT modify files, run commands or fetch anything over the " +
  "network; answer with an assessment or a plan.";
export const MAY_ACT_CLAUSE =
  "You may edit files, run shell commands and fetch over the network; the host may ask the user before a call.";

/**
 * Appended to the task block (last, with the request) rather than added as its
 * own context block: it is an instruction about the ANSWER's shape, and the
 * furthest thing from the task is the easiest for a model to lose.
 */
export const PROACTIVE_CLAUSE =
  "(Proactive mode: after the answer, suggest at most three concrete next steps under " +
  "'Next steps'; leave the list out when the work is self-contained.)";

// The prompts of shared/domain/agent-policy: the text the model reads (ADR 0026).

/** The permission clause of a read-only mode, of the one that offers the shell for its reads, and of the others. */
export const READ_ONLY_CLAUSE =
  "Read-only: read and search the project, but MUST NOT modify files, run commands or fetch anything over the " +
  "network; answer with an assessment or a plan.";
export const SHELL_READS_CLAUSE =
  "Read-only: read and search the project, the shell's read-only commands included, but MUST NOT modify files, run " +
  "any other command or fetch anything over the network; answer with an assessment or a plan.";
/** What plan mode adds: the plan is approved by the user, then carried out by a following turn. */
export const PLAN_APPROVAL_CLAUSE =
  "When the request asks for a change or for a file to write, do the reading it needs, then end with the plan of " +
  "it (the files, the steps, how it will be checked): the user is asked to approve the plan, and a following turn " +
  "carries it out with write access. Do not report the change as impossible.";
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

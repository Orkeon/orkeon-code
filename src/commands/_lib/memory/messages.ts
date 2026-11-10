// The text the memory commands show the user (ADR 0026): /memory, /feedback and /memory-admit.

// /memory and /feedback

export const FEEDBACK_USAGE = "usage: /feedback <what should change or keep happening>";
export const FEEDBACK_RECORDED = "feedback recorded — the agent replays feedback memories on every /assistant turn.";

// /memory-admit

export const LIST_TAKES_NOTHING = "memory-admit: --list takes nothing else";
export const IMPORT_TAKES_NOTHING = "memory-admit: --import takes nothing else";
export const REFUSE_USAGE = "memory-admit: --refuse <id> [<motif>]: the id of a pending candidate";
export const motifTooLong = (max: number): string => `memory-admit: a motif of at most ${max} characters`;
export const unknownAdmitOption = (option: string): string =>
  `memory-admit: unknown option '${option}' (--list, --refuse, --import)`;
export const notACandidateId = (token: string): string => `memory-admit: '${token}' is not a candidate id`;

export const HEADLESS =
  "refused: /memory-admit asks before admitting and this session cannot prompt: no asked candidate was admitted. " +
  "Run it in an interactive session (an audited candidate admits unasked when memory.autoAdmitAudited is true).";

/** A question cancelled after another was answered: the session can prompt, the person stopped. */
export const stoppedAt = (id: string): string =>
  `refused: the question about ${id} got no answer: it and the candidates after it stay candidates. Run /memory-admit again for them.`;

export const noPendingCandidate = (dir: string): string => `No pending candidate in ${dir}.`;
export const NO_INGESTION_ON_REFUSAL = "no ingestion on a refusal";
export const notPending = (id: string): string => `${id}: not a pending candidate (/memory-admit --list)`;
export const NOTHING_ADMITTED = "Nothing admitted.";
export const ADMITTED_UNASKED = "  admitted without a question (audited, memory.autoAdmitAudited is true)";
export const admitQuestion = (id: string): string => `Admit ${id} into the shared memory?`;
export const LEFT_AS_CANDIDATE = "  left as a candidate";

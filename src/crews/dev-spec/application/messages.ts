// The messages of /dev-spec: the lines the person reads at the end of a run, its refusals and warnings, and the
// words of its crew (ADR 0026).

// ── The crew ────────────────────────────────────────────────────────────

export const SPEC_WRITER_GOAL =
  "Write what a feature does and the rules it follows, in business words, and settle its open questions with the person";
export const SPEC_REVIEW_TASK = "review of the spec";

// ── The run ─────────────────────────────────────────────────────────────

export const DEV_SPEC_NEXT = "→ Next step, once you have validated the spec: /dev-plan {code}";
export const rendererDefect = (step: string, first: string): string =>
  `${step}: a checked answer rendered a spec that fails its self-check (a renderer defect): ${first}`;
export const changeBriefExists = (step: string, shown: string, code: string): string =>
  `${step}: ${shown}/CHANGE-${code}.md exists: a code has one source; revise it with /dev-spec ${code} <its kind: bug, refactor or perf>, or pick another code`;
export const cannotBeReadNothingWritten = (step: string, shown: string, why: string): string =>
  `${step}: ${shown} cannot be read (${why}); nothing is written`;
export const newSpecNeedsBrief = (step: string, code: string): string =>
  `${step}: a new spec needs its brief: /dev-spec ${code} <what the feature does, for whom, why> (or a path to a .md file)`;
export const refusedTwice = (step: string): string => `${step}: the spec was refused twice; nothing is written.`;
export const decisionsThisRun = (made: string): string => `decisions this run: ${made}`;
export const blockedUnanswered = (step: string, shown: string): string =>
  `${step}: BLOCKED — a question went unanswered; the open questions are in ${shown} § 12.`;
export const answerThem = (code: string): string =>
  `→ Answer them: /dev-spec ${code} in an interactive session, or edit the file; nothing was decided for you.`;
export const stillBlocking = (ids: string, code: string): string =>
  `→ ${ids} still Blocking: /dev-plan refuses the spec until settled: /dev-spec ${code}, or edit the file.`;
export const specNotWrittenAnswersKept = (step: string, shown: string, why: string): string =>
  `${step}: ${shown} could not be written (${why}); the answers given so far are in the file when it was written before`;

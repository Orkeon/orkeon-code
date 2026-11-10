// The messages of the change brief's step: the lines the person reads at the end of a run, its refusals and
// warnings, the facts code writes from the run, and the words of its crew (ADR 0026). The lines /dev-spec says the
// same way are imported from its messages.

// ── The crew ────────────────────────────────────────────────────────────

export const WRITER_GOAL =
  "Write what is wrong or costly in code that exists, the evidence that shows it and what must survive, and settle its open questions with the person";
export const REVIEW_TASK = "review of the brief";

// ── The run ─────────────────────────────────────────────────────────────

export const DEV_CHANGE_NEXT = "→ Next step, once you have validated the brief: /dev-plan {code}";
export const FEATURE_LINE = "→ a feature, not a change: the spec SPEC-{code}.md follows";
export const invalidKind = (step: string): string => `${step}: invalid crew input: kind`;
export const specExists = (step: string, shown: string, code: string): string =>
  `${step}: ${shown}/SPEC-${code}.md exists: a code has one source; revise it with /dev-spec ${code} (no kind), or pick another code`;
export const titleNamesNoKind = (step: string, shown: string): string =>
  `${step}: ${shown}: the title names no kind (bug, refactor or perf); fix the title first`;
export const briefKeepsKind = (step: string, shown: string, fileKind: string, kind: string): string =>
  `${step}: ${shown} is a ${fileKind} change: a brief keeps its kind; pick another code for a ${kind}`;
export const nameTheKind = (step: string, code: string): string =>
  `${step}: name the kind: /dev-spec ${code} bug|refactor|perf [--run "<command>"] <origin>`;
export const runIsForBugOrPerf = (step: string): string =>
  `${step}: --run is for a bug or a perf change; a refactor is pinned by its tests`;
export const newBriefNeedsOrigin = (step: string, code: string, kind: string): string =>
  `${step}: a new brief needs its origin: /dev-spec ${code} ${kind} <#issue | path | text>`;
export const deniedNothingWritten = (step: string, denied: string): string => `${step}: ${denied}; nothing is written`;
export const reproNotWritten = (step: string, shown: string, why: string): string =>
  `${step}: ${shown} could not be written (${why}); nothing else is written`;
export const rendererDefect = (step: string, first: string): string =>
  `${step}: a checked answer rendered a brief that fails its self-check (a renderer defect): ${first}`;
export const refusedTwice = (step: string): string => `${step}: the brief was refused twice; nothing is written.`;
export const newPromiseKept = (step: string, shown: string): string =>
  `${step}: the request is a new promise, not a change of what exists; ${shown} is kept: a feature takes a code of its own (/dev-spec <code> <brief>)`;
export const unknownTest = (name: string): string => `'${name}' is no test the code index shows: its row reads unpinned`;
export const ROUTED_TO_SPEC = "the rewrite routed the brief to a spec";
export const evidenceLine = (command: string, seconds: number, shown: string): string =>
  `evidence: \`${command}\` (${seconds} s), output in ${shown}`;
export const mustNotChangeLine = (rows: string, unpinned: number): string => `must not change: ${rows}, ${unpinned} unpinned`;
export const blockedUnanswered = (step: string, shown: string): string =>
  `${step}: BLOCKED — a question went unanswered; the open questions are in ${shown} § 8.`;
export const answerThem = (code: string, kind: string): string =>
  `→ Answer them: /dev-spec ${code} ${kind} in an interactive session, or edit the file; nothing was decided for you.`;
export const stillBlocking = (ids: string, code: string, kind: string): string =>
  `→ ${ids} still Blocking: /dev-plan refuses the brief until settled: /dev-spec ${code} ${kind}, or edit the file.`;

// ── The evidence ────────────────────────────────────────────────────────

export const issueViewFailed = (step: string, command: string, why: string): string =>
  `${step}: ${command} failed (${why}): sign gh in (gh auth login), or give the issue's text or a file instead`;
export const issuePrintedNoJson = (step: string, command: string): string =>
  `${step}: ${command} printed no JSON: give the issue's text or a file instead`;
export const NOT_ONE_LINE = "not one line of at most 400 characters";
export const SHELL_OPERATOR = "a shell operator after the CLI";
export const GLOB_OR_EXPANSION = "a glob or an expansion after the CLI";
export const PATH_OUT_OF_CHECKOUT = "a path out of the checkout";
export const runMayNotRun = (step: string, given: string, problem: string): string =>
  `${step}: --run "${given}" may not run (${problem}): give a narrow test command of .orkeon/repo.yaml or the CLI with plain words`;
export const REPRODUCES_THE_BUG = "reproduces the bug";
export const MEASURES_THE_COST = "measures the cost";
export const noCommandPicked = (step: string, what: string, problem: string): string =>
  `${step}: no command that ${what} could be picked (${problem}): give one with --run "<command>"`;
export const runtimeRefused = (why: string): string => `the runtime refused the command: ${why}`;
export const reproductionFact = (command: string, exit: number, seconds: number, fileName: string): string =>
  `- **Reproduction**: \`${command}\` — exit ${exit} after ${seconds} s; the output is in ${fileName}`;
export const measuredFact = (command: string, seconds: number, exit: number, fileName: string): string =>
  `- **Measured**: \`${command}\` — ${seconds} s wall time, exit ${exit}; the output is in ${fileName}`;
export const couldNotRun = (step: string, command: string, output: string): string =>
  `${step}: \`${command}\` could not run (${output}); nothing else is written`;
export const ranOutOfTime = (step: string, command: string, seconds: number, shown: string): string =>
  `${step}: \`${command}\` ran out of its ${seconds} s; nothing else is written (output in ${shown})`;
export const couldNotStart = (step: string, command: string, exit: number, shown: string): string =>
  `${step}: \`${command}\` could not start (exit ${exit}: the command was not found or not executable); ` +
  `nothing else is written (output in ${shown})`;
export const wasKilled = (step: string, command: string, exit: number, shown: string): string =>
  `${step}: \`${command}\` was killed (exit ${exit}), which proves no failure; nothing else is written (output in ${shown})`;
export const didNotReproduce = (step: string, command: string, shown: string): string =>
  `${step}: the bug did not reproduce: \`${command}\` exited 0; nothing else is written (output in ${shown}). ` +
  `Give the failing command with --run, or check the origin.`;
export const measurementFailed = (step: string, command: string, exit: number, shown: string): string =>
  `${step}: the measurement failed: \`${command}\` exited ${exit}; nothing else is written (output in ${shown})`;

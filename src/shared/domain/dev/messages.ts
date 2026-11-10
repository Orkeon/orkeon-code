// The messages of shared/domain/dev: the problems a parser or a check reports and the stops the user reads
// (ADR 0026).

// ── Parse problems of the dev files ─────────────────────────────────────

export const unknownBatchLine = (line: string): string => `unknown batch line '${line}'`;
export const malformedSummaryRow = (row: string): string => `malformed summary row '${row}'`;
export const malformedTddLine = (line: string): string => `malformed TDD line '${line}'`;
export const tddLineOutsideStep = (line: string): string => `TDD line outside a step '${line}'`;
export const twoTddLines = (step: number): string => `step ${step} has two TDD: lines`;
export const unknownVerdictTitle = (title: string): string => `unknown verdict title '${title}'`;
export const unknownVerdictLine = (line: string): string => `unknown verdict line '${line}'`;
export const unknownSeverity = (severity: string): string => `unknown severity '${severity}'`;
export const malformedGapRow = (row: string): string => `malformed gap row '${row}'`;
export const duplicatedId = (id: string): string => `duplicated id ${id}`;
export const idInChangeBrief = (id: string): string => `${id} in a change brief`;
export const BRIEF_TITLE_NAMES_NO_KIND = "the brief's title names no kind (bug, refactor or perf)";

// ── The Blocking stop of /dev-plan ──────────────────────────────────────

export const blockingQuestionsOpen = (shown: string, count: number): string =>
  `dev-plan: ${shown} has ${count} open Blocking question(s); no plan is written.`;
export const settleThemFirst = (settle: string, code: string, change: boolean): string =>
  `→ Settle them first: ${settle} ${code}${change ? " <its kind: bug, refactor or perf>" : ""}, or edit the file; then /dev-plan ${code}.`;

// ── A question as a model gives it ──────────────────────────────────────

export const severityMustBe = (k: number): string => `question ${k}: severity must be Blocking or Major`;
export const questionOneLine = (k: number, max: number): string =>
  `question ${k}: one line of at most ${max} characters ending with ?, no '|'`;
export const impactOneLine = (k: number): string => `question ${k}: the impact is one line, no '|'`;
export const optionCount = (k: number, max: number): string =>
  `question ${k}: no option, or 2 to ${max} options with the recommended one first`;
export const optionOneLine = (k: number, max: number): string =>
  `question ${k}: an option is one line of at most ${max} characters, no ';' nor '|'`;
export const notAnOptionToList = (k: number, option: string): string => `question ${k}: '${option}' is not an option to list`;
export const twoOptionsSame = (k: number): string => `question ${k}: two options read the same`;

// ── The self-check of a plan ────────────────────────────────────────────

export const stepOneMissing = (sheet: string): string => `${sheet}: step 1 is missing: the sheet has no step`;
export const stepOutOfOrder = (sheet: string, step: number, expected: number): string =>
  `${sheet}: step ${step} is numbered out of order (expected ${expected})`;
export const stepHasNoTdd = (sheet: string, step: number): string => `${sheet}: step ${step} has no TDD: line`;
export const lastStepIsNot = (sheet: string, step: number, build: string): string =>
  `${sheet}: step ${step} is the last step and is not ${build}`;
export const buildStepHoldsTdd = (sheet: string, step: number, build: string): string =>
  `${sheet}: step ${step} is ${build} and holds a TDD: line`;
export const anchorRowsMismatch = (sheet: string, rows: number, steps: number): string =>
  `${sheet}: ## Anchors has ${rows} rows for ${steps} steps`;
export const designIdsNeither = (missing: readonly string[]): string =>
  `design ids neither applied nor non-applicable: ${missing.join(", ")}`;
export const batchesDiffer = (summary: string, lines: string, sheets: string): string =>
  `batches differ: summary ${summary}, plan lines ${lines}, sheets ${sheets}`;
export const dependsOnDiffers = (sheet: string, summary: string, own: string): string =>
  `${sheet}: Depends on differs between the summary (${summary}) and the sheet (${own})`;
export const noTraceabilityRow = (id: string): string => `${id}: no row of ## 2. Traceability`;
export const noTestNamesIt = (id: string): string => `${id}: no test of any sheet's ## TDD sequence names it`;
export const notASourceId = (sheet: string, id: string): string => `${sheet}: ${id} is not an id of the source`;
export const noAppliedRulesRow = (sheet: string): string => `${sheet}: no Applied rules row`;
export const assumptionsNotEmpty = (sheet: string): string => `${sheet}: ## Assumptions is not empty`;
export const idOutsideBatch = (sheet: string, id: string): string =>
  `${sheet}: ${id} appears in ## TDD sequence outside the batch's ids`;

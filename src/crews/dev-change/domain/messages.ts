// The messages of dev-change's domain: the problems the check of a change answer reports, which the model reads back
// on a re-ask and the person in the refusal (ADR 0026).

export const NO_CHANGE_SUMMARY = "summary: what is wrong or costly, where it shows, why now";
export const NO_CRITERION = "criteria: at least one acceptance criterion";
export const tooManyCriteria = (max: number): string => `criteria: at most ${max}`;
export const noProof = (id: string): string =>
  `${id}: no proof (the test that reproduces, the measurement and its target, or "no observable behaviour changes")`;
export const severityIsBlockingOrWarning = (id: string): string => `${id}: severity is blocking or warning`;
export const PERF_NEEDS_NUMBER = "a performance change has a criterion with a number as its target";
export const REFACTOR_NEEDS_PIN = "a refactor names at least one behaviour that must not change, and the test pinning it or unpinned";
export const cellOneLine = (name: string, row: number): string => `${name} ${row}: every cell is one line, no '|'`;
export const noBehaviour = (row: number): string => `mustNotChange ${row}: no behaviour`;
export const tooManyLines = (max: number): string => `evidence and constraints: at most ${max} lines each`;
export const noDesign = (hit: string): string =>
  `no design: "${hit}" names a new type, file, pattern or library; say what is observed and expected`;

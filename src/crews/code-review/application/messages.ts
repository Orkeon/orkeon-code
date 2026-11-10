// The text the code-review use case shows the user: its log lines, its progress and its answer.

/** Status-line headline of the /review progress. */
export const REVIEW_PROGRESS_LABEL = "Reviewing changes";

export const reviewInputRefused = (value: string, reason: string): string => `review input refused: '${value}' — ${reason}`;
export const reviewing = (scope: string): string => `reviewing ${scope}`;
export const noChangesInPaths = (paths: string): string => `No changes to review in the named path(s): ${paths}.`;
export const NO_CHANGES = "No changes to review (empty diff).";
export const unknownLens = (lens: string): string =>
  `unknown review lens '${lens}' ignored (valid: correctness, security, style)`;
export const reviewPlan = (plan: string): string => `review plan — ${plan}`;
export const passProgress = (pass: number, lenses: string): string => `pass ${pass} — ${lenses}`;
export const passFindings = (pass: number, passes: number, added: number): string =>
  `review pass ${pass}/${passes}: ${added} raw finding(s)`;
export const reportWritten = (findings: number, files: number, plan: string): string =>
  `/output/code-review-report.md (${findings} findings across ${files} files, ${plan})`;

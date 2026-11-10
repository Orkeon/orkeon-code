// The text code-review shows the user from its domain: the report, the review plan line, the refused scopes.

// ── The report ──────────────────────────────────────────────────────────────

export const REPORT_TITLE = "# Code Review Report";
export const diffCutLine = (shown: number, leftOut: number): string =>
  `- Diff: cut after ${shown} characters, ${leftOut} characters not reviewed`;
export const findingsLine = (count: number, leftOut: number): string =>
  leftOut > 0 ? `- Findings: ${count} (${leftOut} less severe left out)` : `- Findings: ${count}`;
export const NO_ISSUES_IN_PART_REVIEWED = "No issues found in the part reviewed.";
export const NO_ISSUES = "No issues found. ✅";

// ── The review plan line ────────────────────────────────────────────────────

/** Where a lens selection came from, when it is not the default. */
export const lensesFrom = (source: string): string => ` (lenses from the ${source})`;

// ── The refused scopes ──────────────────────────────────────────────────────

export const ABSOLUTE_PATH = "absolute path — review paths are repo-relative";
export const ESCAPING_SEGMENT = "'..' segment — would escape the repository";
export const UNSAFE_PATH_CHARACTER = "contains a character that is unsafe in a shell argument " +
  "(allowed: letters, digits, '.', '_', '-', '/')";
export const IMPLAUSIBLE_REF = "not a plausible git ref (allowed: letters, digits, '.', '_', '-', '/', '~', '^') " +
  "— reviewing the staged changes instead";

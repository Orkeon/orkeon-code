// The text /branch, /commit, /diff, /review and /passes show the user (ADR 0026): their refusals and their answers.
// Read by branch.ts, commit.ts, diff.ts and review.ts.

// /branch
export const looksLikeOption = (name: string) => `'${name}' looks like an option, not a branch name`;
export const notABranchName = (name: string) =>
  `'${name}' is not a plausible branch name (letters, digits, '.', '_', '/', '-')`;
export const dirtyTreeRefusal = (branch: string, count: number, shown: string, more: string) =>
  `refusing to check out '${branch}': ${count} uncommitted change(s) in the working tree.\n` +
  `${shown}${more}\n` +
  "Commit them (/commit) or stash them first — a checkout would either fail or carry them across.";
export const andMore = (count: number) => `\n  … and ${count} more`;
export const branchRefusedLog = (branch: string) =>
  `/branch refused: uncommitted changes block the checkout of '${branch}'`;
export const checkoutFailed = (reason: string) => `checkout failed: ${reason}`;
export const switchedTo = (branch: string) => `switched to '${branch}'`;
export const exitCode = (code: number) => `exit code ${code}`;

// /commit
export const cannotPromptRefusal = (reason: string) =>
  "refused: /commit needs a confirmation and this session cannot prompt " +
  `(${reason}). Re-run as '/commit --yes' if you intend to stage ` +
  "and commit the changed files unattended.";
export const NO_ANSWER_REFUSAL =
  "refused: the confirmation prompt returned no answer (non-interactive session). " +
  "Re-run as '/commit --yes' to stage and commit the changed files unattended.";
export const COMMIT_CANCELLED = "cancelled — nothing was staged and nothing was committed.";
export const refusedLine = (reason: string) => `✗ refused: ${reason}`;
export const failedLine = (reason: string) => `✗ ${reason}`;
export const commitApproved = (mode: string, via: string) => `commit approved — permission mode '${mode}' (${via})`;

// /diff
/** Baseline wording for an empty diff — a distinct sentence, not "(no output)". */
export const NO_CHANGES_MESSAGE = "No changes to show.";
export const notAnAllowedDiffOption = (allowed: string) => `not an allowed diff option (allowed: ${allowed})`;
export const NOT_A_PATHSPEC = "not a plausible pathspec (letters, digits, '.', '_', '/', '-', '*'; no '..')";
export const STAGED_CHANGES = "staged changes";
export const WORKING_TREE_CHANGES = "working-tree changes since the last commit";
export const diffIgnored = (value: string, reason: string) => `/diff ignored '${value}' — ${reason}`;
export const diffFailed = (reason: string) => `git diff failed: ${reason}`;
export const noChanges = (scope: string) => `${NO_CHANGES_MESSAGE} (${scope})`;
export const scopeLine = (scope: string) => `── ${scope}`;
export const argumentsIgnored = (count: number) => `${count} argument(s) ignored — see the log.`;

// /review and /passes
export const invalidPassCount = (token: string, min: number, max: number) =>
  `invalid pass count '${token}' — expected an integer between ${min} and ${max}.`;
export const reviewUnknownOption = (token: string) =>
  `review: unknown option '${token}' (--files, --commit, --lens, --passes)`;
export const reviewTakesValue = (name: string) => `review: ${name} takes a value`;
export const reviewLensTakes = (lenses: string, lens: string) => `review: --lens takes ${lenses}, not '${lens}'`;
export const defaultPasses = (min: number) => `${min} (default)`;
export const passesShown = (current: string, min: number, max: number) =>
  `reasoning passes: ${current}\n/review runs that many lens rounds.\n` +
  `usage: /passes <${min}-${max}> (this session) or /review --passes <${min}-${max}> (one run)`;
export const passesSet = (n: number, calls: number) =>
  `reasoning passes set to ${n} — /review will make ${calls} lens calls per run (session-scoped; /clear clears it).`;

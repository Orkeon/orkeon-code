// The text /commit shows the user from its domain: the fallback message, the refusals, the confirmation plan and
// the usage.

/** The commit message when the drafted one is empty. */
export const FALLBACK_COMMIT_MESSAGE = "chore: update working tree";

/** The reason of a refusing reply that gives none. */
export const NO_REASON_GIVEN = "no reason given";

// ── The guards ──────────────────────────────────────────────────────────────

export const NO_PERMISSION_MODE =
  "no permission mode reached the git-commit crew — refusing to stage and commit. " +
  "The command must thread `permissionMode` in its crew inputs.";
export const readOnlyMode = (mode: string): string =>
  `permission mode '${mode}' is read-only — no staging, no commit. ` +
  "Switch with /mode acceptEdits (or bypassPermissions) and re-run /commit.";

// ── The confirmation plan ───────────────────────────────────────────────────

export const onBranch = (branch: string): string => ` on '${branch}'`;
export const changesUnder = (paths: string): string => `the changes under ${paths}`;
export const EVERY_CHANGE_LISTED = "EVERY change the status lists (untracked files included), the work folder left out";

/** The one-line question of the confirmation. */
export const commitQuestion = (named: boolean, where: string, push: boolean, pr: boolean): string =>
  `Commit ${named ? "the changes under the paths named" : "EVERY change"}${where}${push ? " and push" : ""}${pr ? ", then open the pull request" : ""}?`;

/** The notice printed before the question, one line each. */
export const commitNotice = (branch: string, what: string, push: boolean, pr: boolean): string[] => [
  `/commit will, ${branch.length > 0 ? `on branch '${branch}'` : "on the current branch"}:`,
  "  1. check that git has an identity (git var), and stop if it has none",
  `  2. git add -- <files>    — ${what}`,
  "  3. draft a Conventional-Commits message with the LLM",
  "  4. git commit -F <that message> -- <files>   (changes staged elsewhere stay out)",
  ...(pr
    ? ["  5. git push -u origin <branch>, then open the pull request with the github tool",
      "     (or print the gh pr create command when it cannot)"]
    : push ? ["  5. git push -u origin <branch>, then print the pull request command"] : []),
  "A file that usually holds a secret (.env, a private key) stops it before step 2.",
  "The message is drafted after this confirmation; it is echoed when the commit lands.",
];

// ── The arguments ───────────────────────────────────────────────────────────

export const COMMIT_USAGE = "Usage: /commit [--yes] [--push] [--pr] [--note <text>] [<path>...]";
export const NOTE_NEEDS_TEXT = `✗ --note takes the reason as a text. ${COMMIT_USAGE}`;
export const unknownOption = (option: string): string => `✗ unknown option '${option}'. ${COMMIT_USAGE}`;

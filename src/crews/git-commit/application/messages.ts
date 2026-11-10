// The text the git-commit use case shows the user: its refusals and its result lines.

export const refused = (reason: string): string => `✗ refused: ${reason}`;
export const commitRefusedLog = (reason: string): string => `git-commit refused: ${reason}`;
export const NOTHING_TO_COMMIT = "Nothing to commit — working tree clean.";
export const noChangeUnder = (paths: string): string => `no change under ${paths}`;
export const notThroughShell = (paths: string): string => `${paths} cannot go through the shell (commit by hand)`;
export const workFolderLeftOut = (count: number, folder: string): string =>
  `left out: ${count} file(s) of the work folder ${folder}/`;
export const NOTHING_OUTSIDE_WORK_FOLDER = "Nothing to commit outside the work folder.";
export const secretRefused = (paths: string, count: number): string =>
  `✗ refused: ${paths} usually ${count === 1 ? "holds" : "hold"} a secret; ` +
  "commit by hand if it is meant to be tracked, or add it to .gitignore";
export const draftFlagged = (refusal: string): string => `✗ refused: the drafted message flagged ${refusal}`;
export const pushed = (branch: string): string => `✓ pushed ${branch} to origin`;
export const committed = (hash: string, branch: string, subject: string, note: string | undefined): string =>
  `✓ committed ${hash} on ${branch}\n${subject}${note === undefined ? "" : `\n⚠ ${note}`}`;

// The project's files, read with git for the briefs that list them (the audit's, the next batch's review's):
// tracked and untracked files alike, the ignored ones aside, under the shell's own root (a batch's worktree
// when the shell is rooted). A git that fails or throws lists nothing: the brief then carries no list.
import type { Shell } from "../ports.ts";
import { parseTrackedFiles } from "../../domain/dev/project-files.ts";

/** The listing: the tracked files and the untracked ones git does not ignore. */
export const PROJECT_FILES_COMMAND = "git ls-files --cached --others --exclude-standard";

export async function listProjectFiles(shell: Pick<Shell, "run">, work: string): Promise<string[]> {
  try {
    const r = await shell.run(PROJECT_FILES_COMMAND);
    return r.exitCode === 0 ? parseTrackedFiles(r.stdout, work) : [];
  } catch {
    return [];
  }
}

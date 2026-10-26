// The files of a linked worktree, where `.git` is a file and no folder: what the git use cases that write under
// `.git/` (commit-files, close-batch, the git-commit draft) are tested against.
import { FakeFiles } from "../doubles/fake-files.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

/** FakeFiles whose writes under the given prefixes fail, as a linked worktree's `.git` file makes them. */
export function refusingFiles(refused: readonly string[]): FakeFiles {
  const files = new FakeFiles();
  files.writeErrors = refused.map((prefix) => ({ prefix, error: (path) => new Error(`ENOTDIR: not a directory, open '${path}'`) }));
  return files;
}

/** Files of a linked worktree: `.git/` cannot be written into. */
export const linkedWorktreeFiles = (): FakeFiles => refusingFiles([`${WORKSPACE}/.git/`]);

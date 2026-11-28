// /analyze — which top folders of the checkout are repositories of their own. The checkout is then a
// folder that gathers several (a workspace of services), and the harvest reads what crosses between them.

import type { Files } from "../../../shared/application/ports.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** Top folders checked at most: beyond this the checkout is no folder of repositories one analysis covers. */
export const MAX_REPOSITORY_FOLDERS = 50;

/** Whether `folder` holds a `.git`: a directory with its HEAD, or the file a linked worktree and a
 *  submodule have instead. */
async function isRepository(files: Pick<Files, "read">, folder: string): Promise<boolean> {
  for (const path of [`${folder}/.git/HEAD`, `${folder}/.git`]) {
    try {
      await files.read(path, 1);
      return true;
    } catch {
      // Absent, or a directory read as a file: the next spelling, else no repository.
    }
  }
  return false;
}

/** The folders among `folders` (top folders of the checkout) that are repositories, in the order given.
 *  None when the checkout is a repository itself, or when fewer than two folders are asked: nothing to
 *  compare. */
export async function findRepositories(files: Pick<Files, "read">, folders: readonly string[]): Promise<string[]> {
  if (folders.length < 2 || await isRepository(files, WORKSPACE)) return [];
  const found: string[] = [];
  for (const folder of folders.slice(0, MAX_REPOSITORY_FOLDERS)) {
    if (await isRepository(files, `${WORKSPACE}/${folder}`)) found.push(folder);
  }
  return found;
}

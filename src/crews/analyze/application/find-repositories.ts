// /analyze — which top folders of the checkout are repositories of their own. The checkout is then a
// folder that gathers several (a workspace of services), and the harvest reads what crosses between them.
// Read from the folders themselves, apart from the index: a small repository none of whose packages was
// read is found as well as the largest.

import type { Files, Logger } from "../../../shared/application/ports.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";
import { repositoryFoldersNotChecked } from "./messages.ts";

/** Top folders checked at most, in the order the checkout lists them: each costs a listing, and /analyze's
 *  wall clock counts tool calls. Past them the others are not checked, and the log says how many. */
export const MAX_REPOSITORY_FOLDERS = 50;
/** Entries a listing asks for: the runtime counts a folder's files first, so a `.git` folder is seen in a
 *  folder of fewer files than this. */
export const MAX_LISTED_ENTRIES = 500;

const GIT = ".git";

/** Whether `folder` holds a `.git` — a directory, or the file a linked worktree and a submodule have
 *  instead — read from one listing of the folder. A folder that cannot be listed is no repository. */
async function holdsGit(files: Pick<Files, "list">, folder: string): Promise<boolean> {
  try {
    return (await files.list(folder, MAX_LISTED_ENTRIES)).includes(GIT);
  } catch {
    return false;
  }
}

/** The top folders of the checkout that are repositories, in the order the checkout lists them. None when
 *  the checkout is a repository itself, or when fewer than two of its folders are: one repository alone is
 *  an ordinary checkout. A hidden folder (`.github`) is never one. */
export async function findRepositories(
  files: Pick<Files, "list" | "folders">, log: Pick<Logger, "warn">,
): Promise<string[]> {
  if (await holdsGit(files, WORKSPACE)) return [];
  let folders: string[];
  try {
    folders = (await files.folders(WORKSPACE, MAX_LISTED_ENTRIES)).filter((f) => !f.startsWith("."));
  } catch {
    return [];
  }
  if (folders.length < 2) return [];
  if (folders.length > MAX_REPOSITORY_FOLDERS) {
    log.warn(repositoryFoldersNotChecked(folders.length - MAX_REPOSITORY_FOLDERS, MAX_REPOSITORY_FOLDERS));
  }
  const found: string[] = [];
  for (const folder of folders.slice(0, MAX_REPOSITORY_FOLDERS)) {
    if (await holdsGit(files, `${WORKSPACE}/${folder}`)) found.push(folder);
  }
  return found.length > 1 ? found : [];
}

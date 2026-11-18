// What the destinations test reads: whether a path names a file of this repository.
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Whether `path`, relative to the root of the repository, is a file there. */
export function isRepositoryFile(path: string): boolean {
  try {
    return statSync(fileURLToPath(new URL(`../../${path}`, import.meta.url))).isFile();
  } catch {
    return false;
  }
}

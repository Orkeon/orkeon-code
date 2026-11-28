// The file systems the repository search lists: top folders of the checkout, some holding a `.git`.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** A checkout that is no repository, whose top folders are `folders`, those of `repositories` holding a
 *  `.git` directory among their entries. */
export function filesWithRepositories(folders: readonly string[], repositories: readonly string[] = folders): FakeFiles {
  const files = new FakeFiles();
  files.folderListings.set(WORKSPACE, [...folders]);
  for (const folder of folders) {
    files.listings.set(`${WORKSPACE}/${folder}`, repositories.includes(folder) ? ["README.md", ".git", "src"] : ["README.md"]);
  }
  return files;
}

/** `count` folder names. */
export const manyFolders = (count: number): string[] => Array.from({ length: count }, (_, i) => `repo${i}`);

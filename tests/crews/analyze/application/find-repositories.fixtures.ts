// The file systems the repository search reads: top folders of the checkout, some holding a `.git`.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** The HEAD of a checkout that is a repository itself. */
export const ROOT_HEAD = `${WORKSPACE}/.git/HEAD`;

/** A checkout that is no repository, whose top folders `folders` each hold a `.git` directory. */
export function filesWithRepositories(folders: readonly string[]): FakeFiles {
  const files = new FakeFiles();
  for (const folder of folders) files.files.set(`${WORKSPACE}/${folder}/.git/HEAD`, "ref: refs/heads/main");
  return files;
}

/** `count` folder names. */
export const manyFolders = (count: number): string[] => Array.from({ length: count }, (_, i) => `repo${i}`);

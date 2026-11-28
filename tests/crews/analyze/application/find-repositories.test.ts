// Which top folders of the checkout are repositories, over FakeFiles. Run:
//   node --test tests/crews/analyze/application/find-repositories.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { MAX_REPOSITORY_FOLDERS, findRepositories } from "../../../../src/crews/analyze/application/find-repositories.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { ROOT_HEAD, filesWithRepositories, manyFolders } from "./find-repositories.fixtures.ts";

describe("findRepositories", () => {
  it("keeps the folders that hold a .git directory, in the order asked", async () => {
    // Arrange
    const files = filesWithRepositories(["web", "api"]);

    // Act
    const found = await findRepositories(files, ["api", "docs", "web"]);

    // Assert
    deepStrictEqual(found, ["api", "web"]);
  });

  it("takes a folder whose .git is a file, as a linked worktree and a submodule have", async () => {
    // Arrange
    const files = filesWithRepositories(["api"]);
    files.files.set(`${WORKSPACE}/lib/.git`, "gitdir: ../.git/modules/lib");

    // Act
    const found = await findRepositories(files, ["api", "lib"]);

    // Assert
    deepStrictEqual(found, ["api", "lib"]);
  });

  it("finds none when the checkout is a repository itself, and reads nothing below it", async () => {
    // Arrange
    const files = filesWithRepositories(["api", "web"]);
    files.files.set(ROOT_HEAD, "ref: refs/heads/main");

    // Act
    const found = await findRepositories(files, ["api", "web"]);

    // Assert
    deepStrictEqual({ found, reads: files.reads }, { found: [], reads: [ROOT_HEAD] });
  });

  it("reads nothing when fewer than two folders hold packages", async () => {
    // Arrange
    const files = filesWithRepositories(["api"]);

    // Act
    const found = await findRepositories(files, ["api"]);

    // Assert
    deepStrictEqual({ found, reads: files.reads }, { found: [], reads: [] });
  });

  it(`checks ${MAX_REPOSITORY_FOLDERS} folders at most`, async () => {
    // Arrange
    const folders = manyFolders(MAX_REPOSITORY_FOLDERS + 5);
    const files = filesWithRepositories(folders);

    // Act
    const found = await findRepositories(files, folders);

    // Assert
    strictEqual(found.length, MAX_REPOSITORY_FOLDERS);
  });
});

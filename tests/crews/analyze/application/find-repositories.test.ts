// Which top folders of the checkout are repositories, over FakeFiles. Run:
//   node --test tests/crews/analyze/application/find-repositories.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { MAX_REPOSITORY_FOLDERS, findRepositories } from "../../../../src/crews/analyze/application/find-repositories.ts";
import { repositoryFoldersNotChecked } from "../../../../src/crews/analyze/application/messages.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { filesWithRepositories, manyFolders } from "./find-repositories.fixtures.ts";

describe("findRepositories", () => {
  it("keeps the top folders that hold a .git, in the order the checkout lists them", async () => {
    // Arrange
    const files = filesWithRepositories(["web", "docs", "api"], ["web", "api"]);

    // Act
    const found = await findRepositories(files, new FakeLogger());

    // Assert
    deepStrictEqual(found, ["web", "api"]);
  });

  it("takes a folder whose .git is a file, as a linked worktree and a submodule have", async () => {
    // Arrange
    const files = filesWithRepositories(["api", "lib"], ["api"]);
    files.listings.set(`${WORKSPACE}/lib`, [".git", "src"]);

    // Act
    const found = await findRepositories(files, new FakeLogger());

    // Assert
    deepStrictEqual(found, ["api", "lib"]);
  });

  it("lists each folder once, and reads no file", async () => {
    // Arrange
    const files = filesWithRepositories(["api", "docs", "web"], ["api", "web"]);

    // Act
    await findRepositories(files, new FakeLogger());

    // Assert
    deepStrictEqual({ listed: files.listed, reads: files.reads }, {
      listed: [WORKSPACE, WORKSPACE, `${WORKSPACE}/api`, `${WORKSPACE}/docs`, `${WORKSPACE}/web`], reads: [],
    });
  });

  it("finds none when the checkout is a repository itself, and lists nothing below it", async () => {
    // Arrange
    const files = filesWithRepositories(["api", "web"]);
    files.listings.set(WORKSPACE, [".git", "api", "web"]);

    // Act
    const found = await findRepositories(files, new FakeLogger());

    // Assert
    deepStrictEqual({ found, listed: files.listed }, { found: [], listed: [WORKSPACE] });
  });

  it("finds none when one top folder alone is a repository", async () => {
    // Arrange
    const files = filesWithRepositories(["api", "docs"], ["api"]);

    // Act
    const found = await findRepositories(files, new FakeLogger());

    // Assert
    deepStrictEqual(found, []);
  });

  it("never takes a hidden folder for a repository", async () => {
    // Arrange
    const files = filesWithRepositories([".github", "api", "web"]);

    // Act
    const found = await findRepositories(files, new FakeLogger());

    // Assert
    deepStrictEqual(found, ["api", "web"]);
  });

  it("finds none when the checkout cannot be listed", async () => {
    // Arrange
    const files = filesWithRepositories(["api", "web"]);
    files.listFailure = new Error("directory_read is not available");

    // Act
    const found = await findRepositories(files, new FakeLogger());

    // Assert
    deepStrictEqual(found, []);
  });

  it(`checks ${MAX_REPOSITORY_FOLDERS} folders at most`, async () => {
    // Arrange
    const folders = manyFolders(MAX_REPOSITORY_FOLDERS + 5);
    const files = filesWithRepositories(folders);

    // Act
    const found = await findRepositories(files, new FakeLogger());

    // Assert
    strictEqual(found.length, MAX_REPOSITORY_FOLDERS);
  });

  it("says through the log how many folders the cap left unchecked", async () => {
    // Arrange
    const files = filesWithRepositories(manyFolders(MAX_REPOSITORY_FOLDERS + 5));
    const log = new FakeLogger();

    // Act
    await findRepositories(files, log);

    // Assert
    deepStrictEqual(log.lines, [`warn: ${repositoryFoldersNotChecked(5, MAX_REPOSITORY_FOLDERS)}`]);
  });
});

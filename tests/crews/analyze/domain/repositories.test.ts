// /analyze over a folder of several repositories: the repository of a package, and what crosses. Run:
//   node --test tests/crews/analyze/domain/repositories.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  packageFolder, packageRepositories, repositoryDependencies, topFolders,
} from "../../../../src/crews/analyze/domain/repositories.ts";
import {
  ACROSS, ACROSS_DEPENDENCIES, ACROSS_REPOSITORIES, FOLDER_CASES, packageIn,
} from "./repositories.fixtures.ts";

describe("packageFolder", () => {
  for (const c of FOLDER_CASES) {
    it(c.name, () => {
      // Arrange
      const { pkg } = c;

      // Act
      const folder = packageFolder(pkg);

      // Assert
      strictEqual(folder, c.folder);
    });
  }
});

describe("topFolders", () => {
  it("names each top folder once, in the order of its first package", () => {
    // Arrange
    const scanned = ACROSS;

    // Act
    const folders = topFolders(scanned);

    // Assert
    deepStrictEqual(folders, ["api", "platform", "docs"]);
  });
});

describe("packageRepositories", () => {
  it("gives each package the repository its code sits in, a folder that is no repository aside", () => {
    // Arrange
    const scanned = ACROSS;

    // Act
    const repositories = packageRepositories(scanned, ["api", "platform"]);

    // Assert
    deepStrictEqual([...repositories], ACROSS_REPOSITORIES);
  });

  it("names no repository when one alone holds packages", () => {
    // Arrange
    const scanned = [packageIn("api", "Api"), packageIn("api", "Api.Domain"), packageIn("docs", "convert")];

    // Act
    const repositories = packageRepositories(scanned, ["api", "platform"]);

    // Assert
    deepStrictEqual([...repositories], []);
  });
});

describe("repositoryDependencies", () => {
  it("groups by pair of repositories the packages that depend on a package of the other", () => {
    // Arrange
    const repositories = new Map(ACROSS_REPOSITORIES);

    // Act
    const crossing = repositoryDependencies(ACROSS, repositories);

    // Assert
    deepStrictEqual(crossing, ACROSS_DEPENDENCIES);
  });

  it("finds nothing crossing when every dependency stays in its repository", () => {
    // Arrange
    const scanned = [packageIn("api", "Api", ["Api.Domain"]), packageIn("api", "Api.Domain"), packageIn("web", "Web")];
    const repositories = packageRepositories(scanned, ["api", "web"]);

    // Act
    const crossing = repositoryDependencies(scanned, repositories);

    // Assert
    deepStrictEqual(crossing, []);
  });
});

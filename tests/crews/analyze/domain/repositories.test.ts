// /analyze over a folder of several repositories: the repository of a package, and what crosses. Run:
//   node --test tests/crews/analyze/domain/repositories.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  namesNoFile, packageFolder, packageRepositories, repositoryDependencies,
} from "../../../../src/crews/analyze/domain/repositories.ts";
import {
  ACROSS, ACROSS_DEPENDENCIES, ACROSS_REPOSITORIES, FOLDER_CASES, NAMES_NO_FILE_CASES, packageIn,
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

describe("namesNoFile", () => {
  for (const c of NAMES_NO_FILE_CASES) {
    it(c.name, () => {
      // Arrange
      const { pkg } = c;

      // Act
      const none = namesNoFile(pkg);

      // Assert
      strictEqual(none, c.none);
    });
  }
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

  it("names no repository when fewer than two folders are repositories", () => {
    // Arrange
    const scanned = [packageIn("api", "Api"), packageIn("api", "Api.Domain"), packageIn("docs", "convert")];

    // Act
    const repositories = packageRepositories(scanned, ["api"]);

    // Assert
    deepStrictEqual([...repositories], []);
  });

  it("gives the packages of a repository its name when the other repository holds no package read", () => {
    // Arrange
    const scanned = [packageIn("api", "Api"), packageIn("docs", "convert")];

    // Act
    const repositories = packageRepositories(scanned, ["api", "platform"]);

    // Assert
    deepStrictEqual([...repositories], [[scanned[0].fqn, "api"]]);
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

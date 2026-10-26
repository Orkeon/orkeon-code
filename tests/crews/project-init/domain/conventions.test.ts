// Run: node --test src/crews/project-init/domain/conventions.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { fallbackConventions, CONFIG_CANDIDATES } from "../../../../src/crews/project-init/domain/conventions.ts";
import { FULL_PKG } from "./conventions.fixtures.ts";

describe("CONFIG_CANDIDATES", () => {
  it("reads package.json first", () => {
    // Arrange
    const candidates = CONFIG_CANDIDATES;

    // Act
    const first = candidates[0];

    // Assert
    strictEqual(first, "package.json");
  });
});

describe("fallbackConventions", () => {
  it("pulls the scripts, as they are invoked, and the devDependencies from package.json", () => {
    // Arrange
    const pkg = FULL_PKG;

    // Act
    const c = fallbackConventions(pkg);

    // Assert
    strictEqual(c.buildCommand, "npm run build");
    strictEqual(c.testCommand, "npm test");
    strictEqual(c.lintCommand, "npm run lint");
    deepStrictEqual(c.frameworks, ["vitest", "typescript"]);
  });

  it("returns empty conventions on unparseable input", () => {
    // Arrange
    const pkg = "{not json";

    // Act
    const c = fallbackConventions(pkg);

    // Assert
    deepStrictEqual(c, { frameworks: [], conventions: [] });
  });

  it("tolerates a package.json with no scripts", () => {
    // Arrange
    const pkg = "{}";

    // Act
    const c = fallbackConventions(pkg);

    // Assert
    strictEqual(c.buildCommand, undefined);
    deepStrictEqual(c.frameworks, []);
  });
});

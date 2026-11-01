// Run: node --test tests/shared/domain/project-manifests.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { CONFIG_CANDIDATES, expandCandidates } from "../../../src/shared/domain/project-manifests.ts";
import { COMMANDS_FIRST, EXPANSIONS, WIDENED } from "./project-manifests.fixtures.ts";

describe("CONFIG_CANDIDATES", () => {
  it("reads the manifests with scripts or targets first, package.json leading", () => {
    // Arrange
    const candidates = CONFIG_CANDIDATES;

    // Act
    const first = candidates.slice(0, COMMANDS_FIRST.length);

    // Assert
    deepStrictEqual(first, COMMANDS_FIRST);
  });

  it("reads CONTRIBUTING.md last", () => {
    // Arrange
    const candidates = CONFIG_CANDIDATES;

    // Act
    const last = candidates[candidates.length - 1];

    // Assert
    strictEqual(last, "CONTRIBUTING.md");
  });

  for (const name of WIDENED) {
    it(`reads ${name}`, () => {
      // Arrange
      const candidates = CONFIG_CANDIDATES;

      // Act
      const listed = candidates.includes(name);

      // Assert
      ok(listed, `${name} is not a candidate`);
    });
  }
});

describe("expandCandidates", () => {
  for (const c of EXPANSIONS) {
    it(c.name, () => {
      // Arrange
      const { candidates, topLevel } = c;

      // Act
      const paths = expandCandidates(candidates, topLevel);

      // Assert
      deepStrictEqual(paths, c.expected);
    });
  }
});

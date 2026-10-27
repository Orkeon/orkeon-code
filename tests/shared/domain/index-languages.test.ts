// The languages index_codebase is asked for: the registry's grammars less the ones the runtime refuses to read. Run:
//   node --test tests/shared/domain/index-languages.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";

import { INDEXED_LANGUAGES, TREE_LANGUAGES } from "../../../src/shared/domain/index-languages.ts";
import { BLOCKED_GRAMMARS, KEPT_GRAMMARS, REGISTRY_GRAMMARS } from "./index-languages.fixtures.ts";

describe("the languages index_codebase is asked for", () => {
  it("mirrors the runtime's registry of grammars", () => {
    // Arrange
    const registry = REGISTRY_GRAMMARS;

    // Act
    const mirrored = TREE_LANGUAGES;

    // Assert
    deepStrictEqual(mirrored, registry);
  });

  for (const grammar of BLOCKED_GRAMMARS) {
    it(`leaves ${grammar} out, whose files the path validator refuses to read`, () => {
      // Arrange
      const blocked = grammar;

      // Act
      const asked = INDEXED_LANGUAGES.includes(blocked);

      // Assert
      ok(!asked, `${blocked} must not be asked of index_codebase`);
    });
  }

  for (const grammar of KEPT_GRAMMARS) {
    it(`keeps asking for ${grammar}`, () => {
      // Arrange
      const kept = grammar;

      // Act
      const asked = INDEXED_LANGUAGES.includes(kept);

      // Assert
      ok(asked, `${kept} must stay in the index`);
    });
  }

  it("asks for every grammar of the registry but the blocked ones", () => {
    // Arrange
    const expected = REGISTRY_GRAMMARS.filter((g) => !BLOCKED_GRAMMARS.includes(g));

    // Act
    const asked = INDEXED_LANGUAGES;

    // Assert
    deepStrictEqual(asked, expected);
  });
});

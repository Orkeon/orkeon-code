// A sub-agent's charter: its catalogue and the reasons it cannot run. Run:
//   node --test tests/shared/domain/agents/charter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { CHARTER_NAME, MAX_BRIEF_CHARS, charterCatalogue, charterProblems } from "../../../../src/shared/domain/agents/charter.ts";
import {
  ALL_PROBLEMS, BAD_NAMES, GOOD_NAMES, KEPT_ITERATIONS, READ_ONLY_MODES, REFUSED_ITERATIONS, reader,
} from "./charter.fixtures.ts";

describe("charterCatalogue", () => {
  it("keeps the read tools a plan charter lists, in its order", () => {
    // Arrange
    const charter = reader();

    // Act
    const catalogue = charterCatalogue(charter);

    // Assert
    deepStrictEqual(catalogue, ["file_read", "codebase_search", "symbol_detail", "symbol_source"]);
  });

  it("removes the disallowed tools", () => {
    // Arrange
    const charter = reader({ disallowed: ["codebase_search"] });

    // Act
    const catalogue = charterCatalogue(charter);

    // Assert
    deepStrictEqual(catalogue, ["file_read", "symbol_detail", "symbol_source"]);
  });

  it("drops a tool the mode does not offer", () => {
    // Arrange
    const charter = reader({ tools: ["file_read", "shell_command"] });

    // Act
    const catalogue = charterCatalogue(charter);

    // Assert
    deepStrictEqual(catalogue, ["file_read"]);
  });
});

describe("charterProblems", () => {
  for (const mode of READ_ONLY_MODES) {
    it(`is empty for a read-only charter: ${mode}`, () => {
      // Arrange
      const charter = reader({ mode });

      // Act
      const problems = charterProblems(charter);

      // Assert
      deepStrictEqual(problems, []);
    });
  }

  it("refuses a charter in a mode that can write", () => {
    // Arrange
    const charter = reader({ mode: "default" });

    // Act
    const problems = charterProblems(charter);

    // Assert
    deepStrictEqual(problems, [
      "charter code-reader: mode default can write; a sub-agent runs read-only (plan or dontAsk) for now",
    ]);
  });

  it("names a write tool the mode does not offer", () => {
    // Arrange
    const charter = reader({ tools: ["file_read", "file_write", "shell_command"] });

    // Act
    const problems = charterProblems(charter);

    // Assert
    deepStrictEqual(problems, [
      "charter code-reader: file_write is not offered in mode plan",
      "charter code-reader: shell_command is not offered in mode plan",
    ]);
  });

  it("refuses an empty catalogue", () => {
    // Arrange
    const charter = reader({ tools: ["file_read"], disallowed: ["file_read"] });

    // Act
    const problems = charterProblems(charter);

    // Assert
    deepStrictEqual(problems, [
      "charter code-reader: no tool left once the mode and the disallowed list apply",
    ]);
  });

  for (const k of REFUSED_ITERATIONS) {
    it(`refuses 0 and 81 iterations: ${k}`, () => {
      // Arrange
      const charter = reader({ maxIterations: k });

      // Act
      const problems = charterProblems(charter);

      // Assert
      deepStrictEqual(problems, [`charter code-reader: maxIterations ${k} is not between 1 and 80`]);
    });
  }

  for (const k of KEPT_ITERATIONS) {
    it(`keeps 1 and 80 iterations: ${k}`, () => {
      // Arrange
      const charter = reader({ maxIterations: k });

      // Act
      const problems = charterProblems(charter);

      // Assert
      deepStrictEqual(problems, []);
    });
  }

  for (const name of GOOD_NAMES) {
    it(`checks the name pattern, which takes ${name.length} characters of kebab-case`, () => {
      // Arrange
      const pattern = CHARTER_NAME;

      // Act
      const matches = pattern.test(name);

      // Assert
      ok(matches);
    });
  }

  for (const bad of BAD_NAMES) {
    it(`checks the name pattern, which refuses '${bad}'`, () => {
      // Arrange
      const charter = reader({ name: bad });

      // Act
      const problems = charterProblems(charter);

      // Assert
      deepStrictEqual(problems[0], `charter name '${bad}' is not a kebab-case name of 2 to 40 characters`);
    });
  }

  it("lists the problems in the frozen order", () => {
    // Arrange
    const charter = reader({ name: "X", mode: "acceptEdits", tools: [], maxIterations: 0 });

    // Act
    const problems = charterProblems(charter);

    // Assert
    deepStrictEqual(problems, ALL_PROBLEMS);
  });

  it("caps a brief at 24 000 characters", () => {
    // Arrange
    const expected = 24_000;

    // Act
    const cap = MAX_BRIEF_CHARS;

    // Assert
    strictEqual(cap, expected);
  });
});

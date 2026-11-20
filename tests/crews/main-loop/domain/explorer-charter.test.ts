// The main loop's explorer charter: it can run, and in plan mode it keeps every tool it names. Run:
//   node --test tests/crews/main-loop/domain/explorer-charter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { EXPLORER_CHARTER, EXPLORER_TOOLS } from "../../../../src/crews/main-loop/domain/explorer-charter.ts";
import { charterCatalogue, charterProblems } from "../../../../src/shared/domain/agents/charter.ts";

describe("EXPLORER_CHARTER", () => {
  it("is a charter that can run: a kebab name, a read-only mode, tools that mode offers", () => {
    // Arrange
    const charter = EXPLORER_CHARTER;

    // Act
    const problems = charterProblems(charter);

    // Assert
    deepStrictEqual(problems, []);
  });

  it("is offered every tool it names, none dropped by plan mode or its disallowed list", () => {
    // Arrange
    const charter = EXPLORER_CHARTER;

    // Act
    const catalogue = charterCatalogue(charter);

    // Assert
    deepStrictEqual(catalogue, [...EXPLORER_TOOLS]);
  });
});

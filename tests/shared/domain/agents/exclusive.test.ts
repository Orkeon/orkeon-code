// The refusal of an exclusive crew launch while the crew runs (Orkeon #239). Run:
//   node --test tests/shared/domain/agents/exclusive.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { exclusiveLine, exclusiveRefusal } from "../../../../src/shared/domain/agents/exclusive.ts";
import { EXCLUSIVE_REFUSALS, LINE, OTHER_FAILURES } from "./exclusive.fixtures.ts";

describe("exclusiveRefusal", () => {
  for (const c of EXCLUSIVE_REFUSALS) {
    it(`reads the crew and the ticket from the runtime's message, as ${c.name}`, () => {
      // Arrange
      const { failure } = c;

      // Act
      const refusal = exclusiveRefusal(failure);

      // Assert
      deepStrictEqual(refusal, c.refusal);
    });
  }

  for (const c of OTHER_FAILURES) {
    it(`is null for any other failure: ${c.name}`, () => {
      // Arrange
      const { failure } = c;

      // Act
      const refusal = exclusiveRefusal(failure);

      // Assert
      strictEqual(refusal, null);
    });
  }
});

describe("exclusiveLine", () => {
  it("names the crew and the ticket, and says to wait then type the line again", () => {
    // Arrange
    const refusal = { crew: "code-review", ticket: "t2" };

    // Act
    const line = exclusiveLine(refusal);

    // Assert
    strictEqual(line, LINE);
  });
});

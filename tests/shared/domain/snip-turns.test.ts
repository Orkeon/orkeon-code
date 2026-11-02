// The turns of the harness as session_snip counts them. Run:
//   node --test tests/shared/domain/snip-turns.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { messagesOfLastTurns, runtimeTurnsToKeep } from "../../../src/shared/domain/snip-turns.ts";
import { KEEP_CASES, TAIL_CASES } from "./snip-turns.fixtures.ts";

describe("runtimeTurnsToKeep", () => {
  for (const c of KEEP_CASES) {
    it(c.name, () => {
      // Arrange
      const { messages, turns } = c;

      // Act
      const keep = runtimeTurnsToKeep(messages, turns);

      // Assert
      strictEqual(keep, c.keep);
    });
  }
});

describe("messagesOfLastTurns", () => {
  for (const c of TAIL_CASES) {
    it(c.name, () => {
      // Arrange
      const { messages, runtimeTurns } = c;

      // Act
      const tail = messagesOfLastTurns(messages, runtimeTurns);

      // Assert
      strictEqual(tail, c.tail);
    });
  }
});

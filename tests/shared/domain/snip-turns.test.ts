// The turns of the harness as session_snip counts them. Run:
//   node --test tests/shared/domain/snip-turns.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { runtimeTurnsToKeep } from "../../../src/shared/domain/snip-turns.ts";
import { KEEP_CASES } from "./snip-turns.fixtures.ts";

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


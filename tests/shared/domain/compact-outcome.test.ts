// The compaction outcome line. Run:
//   node --test tests/shared/domain/compact-outcome.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { formatOutcome } from "../../../src/shared/domain/compact-outcome.ts";
import { OUTCOME_CASES } from "./compact-outcome.fixtures.ts";

describe("formatOutcome", () => {
  for (const c of OUTCOME_CASES) {
    it(c.name, () => {
      // Arrange
      const { outcome } = c;

      // Act
      const line = formatOutcome(outcome);

      // Assert
      strictEqual(line, c.line);
    });
  }
});

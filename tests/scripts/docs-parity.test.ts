// The documentation parity check (scripts/check-docs-parity.mjs), run for real on scratch checkouts:
// a conformant pair of pages passes, then one case per rule it enforces: a missing twin (and the
// --pending flag that excuses one while it is written), the heading levels, the fenced code blocks,
// the rows of the tables, and the two toc.yml listing the same pages in the same order. Run:
//   node --test tests/scripts/docs-parity.test.ts
import { describe, it } from "node:test";
import { checkParity, PARITY_CASES } from "./docs-parity.fixtures.ts";
import { assertOutcome } from "./docs-parity.assertions.ts";

describe("the documentation parity check", () => {
  for (const c of PARITY_CASES) {
    it(c.name, () => {
      // Arrange
      const { files, args } = c;

      // Act
      const result = checkParity(files, args);

      // Assert
      assertOutcome(result, c.status, c.says);
    });
  }
});

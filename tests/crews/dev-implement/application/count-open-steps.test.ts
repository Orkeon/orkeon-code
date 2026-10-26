// The open steps of a batch sheet, counted before a /dev-implement run to size its budget; undefined when the sheet
// cannot be found, read or parsed. Over FakeFiles, FakeShell and a config store on the files. Run:
//   node --test src/crews/dev-implement/application/count-open-steps.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { countOpenSteps } from "../../../../src/crews/dev-implement/application/count-open-steps.ts";
import { COUNT_CASES } from "./count-open-steps.fixtures.ts";

describe("countOpenSteps", () => {
  for (const c of COUNT_CASES) {
    it(c.name, async () => {
      // Arrange
      const deps = c.deps();

      // Act
      const count = await countOpenSteps(deps, "F1", c.plan);

      // Assert
      strictEqual(count, c.expected);
    });
  }
});

// The pruning of an act's tool loop: the setting that turns it on, and the tally an act hands back. Run:
//   node --test tests/shared/domain/context-prune.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { pruneOn, pruneTallyOf } from "../../../src/shared/domain/context-prune.ts";
import { NO_TALLY_CASES, ON_CASES, RUNTIME_PRUNED, RUNTIME_TALLY } from "./context-prune.fixtures.ts";

describe("pruneOn", () => {
  for (const c of ON_CASES) {
    it(`reads ${JSON.stringify(c.value)} as ${c.on ? "on" : "off"}`, () => {
      // Arrange
      const value = c.value;

      // Act
      const on = pruneOn(value);

      // Assert
      strictEqual(on, c.on);
    });
  }
});

describe("pruneTallyOf", () => {
  it("reads the counts of the runtime's tally", () => {
    // Arrange
    const pruned = RUNTIME_PRUNED;

    // Act
    const tally = pruneTallyOf(pruned);

    // Assert
    deepStrictEqual(tally, RUNTIME_TALLY);
  });

  for (const c of NO_TALLY_CASES) {
    it(`reads no tally from ${c.name}`, () => {
      // Arrange
      const pruned = c.pruned;

      // Act
      const tally = pruneTallyOf(pruned);

      // Assert
      strictEqual(tally, null);
    });
  }
});

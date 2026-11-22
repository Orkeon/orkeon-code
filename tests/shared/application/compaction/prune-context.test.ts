// The pruning bound for one act, over fakes. Run:
//   node --test tests/shared/application/compaction/prune-context.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { contextPruning } from "../../../../src/shared/application/compaction/prune-context.ts";
import { PRUNE_WITHOUT_DECISION_MODEL, prunedLine } from "../../../../src/shared/application/compaction/messages.ts";
import { FIVE_JUDGED, NONE_JUDGED, NO_MODEL_WARNING, pruneSetup } from "./prune-context.fixtures.ts";

describe("contextPruning", () => {
  for (const setting of ["off", null]) {
    it(`adds nothing to the act when compaction.prune is ${setting ?? "unset"}`, async () => {
      // Arrange
      const { deps } = pruneSetup(setting);

      // Act
      const pruning = await contextPruning(deps);

      // Assert
      deepStrictEqual(pruning, {});
    });
  }

  it("adds nothing when the setting cannot be read", async () => {
    // Arrange
    const { deps, config } = pruneSetup();
    config.failure = new Error("unreadable");

    // Act
    const pruning = await contextPruning(deps);

    // Assert
    deepStrictEqual(pruning, {});
  });

  it("adds nothing and says why when the host has no decision model", async () => {
    // Arrange
    const { deps, decision, log } = pruneSetup();
    decision.present = false;

    // Act
    const pruning = await contextPruning(deps);

    // Assert
    deepStrictEqual([pruning, log.lines], [{}, [`warn: ${PRUNE_WITHOUT_DECISION_MODEL}`]]);
  });

  it("names the settings and the key variables to check when the host has no decision model", async () => {
    // Arrange
    const { deps, decision, log } = pruneSetup();
    decision.present = false;

    // Act
    await contextPruning(deps);

    // Assert
    deepStrictEqual(log.lines, [NO_MODEL_WARNING]);
  });

  it("asks the runtime for its pruning when the setting is on", async () => {
    // Arrange
    const { deps } = pruneSetup();

    // Act
    const pruning = await contextPruning(deps);

    // Assert
    strictEqual(pruning.prune, true);
  });

  it("asks the decision model nothing itself", async () => {
    // Arrange
    const { deps, decision } = pruneSetup();

    // Act
    await contextPruning(deps);

    // Assert
    deepStrictEqual(decision.asked, []);
  });
});

describe("the tally handed to contextPruning's binding", () => {
  it("says what the act pruned", async () => {
    // Arrange
    const { deps, log } = pruneSetup();
    const pruning = await contextPruning(deps);

    // Act
    pruning.onPruned?.(FIVE_JUDGED);

    // Assert
    deepStrictEqual(log.lines, [`info: ${prunedLine(5, 2, 1, 4_100)}`]);
  });

  it("says nothing when the act judged no result", async () => {
    // Arrange
    const { deps, log } = pruneSetup();
    const pruning = await contextPruning(deps);

    // Act
    pruning.onPruned?.(NONE_JUDGED);

    // Assert
    deepStrictEqual(log.lines, []);
  });
});

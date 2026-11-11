// The pruning bound for one act, over fakes. Run:
//   node --test tests/shared/application/compaction/prune-context.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { contextPruning } from "../../../../src/shared/application/compaction/prune-context.ts";
import {
  PRUNE_DECISION_FAILED, PRUNE_WITHOUT_DECISION_MODEL,
} from "../../../../src/shared/application/compaction/messages.ts";
import {
  PRUNED_TWO, REQUEST, THIRTY_LARGE, TWO_LARGE_ONE_SMALL, noneNeeded, pruneSetup,
} from "./prune-context.fixtures.ts";

describe("contextPruning", () => {
  for (const setting of ["off", null]) {
    it(`adds nothing to the act when compact.prune is ${setting ?? "unset"}`, async () => {
      // Arrange
      const { deps } = pruneSetup(setting);

      // Act
      const pruning = await contextPruning(deps, REQUEST);

      // Assert
      deepStrictEqual(pruning, {});
    });
  }

  it("adds nothing and says why when the host has no decision model", async () => {
    // Arrange
    const { deps, decision, log } = pruneSetup();
    decision.present = false;

    // Act
    const pruning = await contextPruning(deps, REQUEST);

    // Assert
    deepStrictEqual([pruning, log.lines], [{}, [`warn: ${PRUNE_WITHOUT_DECISION_MODEL}`]]);
  });

  it("asks from 40 % of the session's window", async () => {
    // Arrange
    const { deps } = pruneSetup();

    // Act
    const pruning = await contextPruning(deps, REQUEST);

    // Assert
    deepStrictEqual(pruning.contextPressure, { thresholdTokens: 80_000, keepRecent: 6, headChars: 300 });
  });

  it("falls back on a window of 128 000 tokens when the budget reports none", async () => {
    // Arrange
    const { deps, session } = pruneSetup();
    session.budget = { used: 0, window: 0 };

    // Act
    const pruning = await contextPruning(deps, REQUEST);

    // Assert
    strictEqual(pruning.contextPressure?.thresholdTokens, 51_200);
  });
});

describe("the callback of contextPruning", () => {
  it("keeps a small result without asking and answers the decision model's verdict for the others", async () => {
    // Arrange
    const { deps, decision } = pruneSetup();
    decision.answers = noneNeeded(2);
    const pruning = await contextPruning(deps, REQUEST);

    // Act
    const verdicts = await pruning.onContextPressure?.(TWO_LARGE_ONE_SMALL);

    // Assert
    deepStrictEqual(verdicts, { "call-3": "keep", "call-1": "drop", "call-2": "drop" });
  });

  it("says what it pruned", async () => {
    // Arrange
    const { deps, decision, log } = pruneSetup();
    decision.answers = noneNeeded(2);
    const pruning = await contextPruning(deps, REQUEST);

    // Act
    await pruning.onContextPressure?.(TWO_LARGE_ONE_SMALL);

    // Assert
    deepStrictEqual(log.lines, [`info: ${PRUNED_TWO}`]);
  });

  it("judges 24 calls at most, by requests of 8", async () => {
    // Arrange
    const { deps, decision } = pruneSetup();
    decision.answers = noneNeeded(8);
    const pruning = await contextPruning(deps, REQUEST);

    // Act
    const verdicts = await pruning.onContextPressure?.(THIRTY_LARGE);

    // Assert
    deepStrictEqual(
      [decision.asked.map((a) => Object.keys(a.questions).length), Object.keys(verdicts ?? {}).length],
      [[16, 16, 16], 24],
    );
  });

  it("prunes nothing when the decision model does not answer", async () => {
    // Arrange
    const { deps, decision, log } = pruneSetup();
    decision.replies = [null];
    const pruning = await contextPruning(deps, REQUEST);

    // Act
    const verdicts = await pruning.onContextPressure?.(TWO_LARGE_ONE_SMALL);

    // Assert
    deepStrictEqual([verdicts, log.lines], [{ "call-3": "keep" }, [`warn: ${PRUNE_DECISION_FAILED}`]]);
  });

  it("does not ask again in the act once the decision model failed", async () => {
    // Arrange
    const { deps, decision } = pruneSetup();
    decision.replies = [null];
    const pruning = await contextPruning(deps, REQUEST);
    await pruning.onContextPressure?.(TWO_LARGE_ONE_SMALL);

    // Act
    await pruning.onContextPressure?.(THIRTY_LARGE);

    // Assert
    strictEqual(decision.asked.length, 1);
  });
});

// Mistake candidates from audit rows (M-4). Run: node --test src/shared/domain/shared-memory/harvest.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { mistakeCandidates } from "./harvest.ts";
import { entryProblems, MAX_BODY_CHARS } from "./entry.ts";
import { GAP_FORTY_TIMES, GAP_IN_THREE_BATCHES, GAP_IN_TWO_BATCHES, GAP_THREE_TIMES, context } from "./harvest.fixtures.ts";

describe("mistakeCandidates", () => {
  it("makes one valid mistake candidate of a gap seen in three batches", () => {
    // Arrange
    const rows = GAP_IN_THREE_BATCHES;

    // Act
    const plan = mistakeCandidates(rows, context());

    // Assert
    strictEqual(plan.candidates.length, 1);
    const c = plan.candidates[0];
    strictEqual(c.id, "shop-mistake-20261024-no-test-of-the-empty-cart");
    strictEqual(c.status, "candidate");
    strictEqual(c.correction, "assert the edge case");
    ok(c.source.startsWith("audit:a/A-VERIFY-F1.md"), c.source);
    deepStrictEqual(entryProblems(c), []);
  });

  it("leaves a gap of two batches below the threshold, and one batch seen twice counts once", () => {
    // Arrange
    const rows = GAP_IN_TWO_BATCHES;

    // Act
    const plan = mistakeCandidates(rows, context());

    // Assert
    deepStrictEqual(plan.candidates, []);
    deepStrictEqual(plan.below, [{ topic: "gap", batches: 2 }]);
  });

  it("names a refused topic and proposes nothing for it", () => {
    // Arrange
    const refusing = context(["gap"]);

    // Act
    const plan = mistakeCandidates(GAP_THREE_TIMES, refusing);

    // Assert
    deepStrictEqual(plan.candidates, []);
    deepStrictEqual(plan.refused, ["gap"]);
  });

  it("keeps the body under the bound by cutting evidence lines", () => {
    // Arrange
    const rows = GAP_FORTY_TIMES;

    // Act
    const c = mistakeCandidates(rows, context()).candidates[0];

    // Assert
    ok(c.body.length <= MAX_BODY_CHARS, `a body of ${c.body.length} characters`);
    ok(/- and \d+ more rows/.test(c.body), "no note of the rows cut");
    deepStrictEqual(entryProblems(c), []);
  });
});

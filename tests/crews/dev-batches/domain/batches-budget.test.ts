// The budget of a /dev-batches run and of one batch of a parallel wave. Run:
//   node --test tests/crews/dev-batches/domain/batches-budget.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { BATCHES_BUDGET, MAX_WAVE, WAVE_BATCH_CALLS, WAVE_MARGIN_SECONDS, WAVE_REVIEW_CALLS, batchLimits, driverBudget } from "../../../../src/crews/dev-batches/domain/batches-budget.ts";
import { MAX_STEPS } from "../../../../src/crews/dev-implement/domain/implement-budget.ts";
import { TOKENS_PER_CALL } from "../../../../src/shared/domain/dev/step-budget.ts";
import { ABOVE_A_WAVE, DRIVER_CONCURRENCIES, ONE_AT_A_TIME, STEP_COUNTS, WAVE_SIZES, expectedBatchLimits } from "./batches-budget.fixtures.ts";
import { assertRuntimeLimits } from "./batches-budget.assertions.ts";
import { assertRuntimeBudget } from "../../../support/assertions/budget.ts";

describe("the driver budgets the runtime reads", () => {
  for (const c of DRIVER_CONCURRENCIES) {
    it(`holds only limits of 1 or more, which the runtime accepts (Orkeon #436): ${c.name}`, () => {
      // Arrange
      const { concurrency } = c;

      // Act
      const budget = driverBudget(concurrency);

      // Assert
      assertRuntimeBudget(budget, c.name);
    });
  }
});

describe("the driver budget above a wave", () => {
  for (const concurrency of ABOVE_A_WAVE) {
    it(`counts the most a wave runs at once for a concurrency of ${concurrency}`, () => {
      // Arrange
      const most = driverBudget(MAX_WAVE);

      // Act
      const budget = driverBudget(concurrency);

      // Assert
      deepStrictEqual(budget, most);
    });
  }
});

describe("batchLimits", () => {
  it("sums the implement run sized to the steps, the audit and the close: tool calls, wall time and tokens", () => {
    // Arrange
    const steps = 3;

    // Act
    const limits = batchLimits(steps);

    // Assert
    deepStrictEqual(limits, expectedBatchLimits(steps));
  });

  for (const c of STEP_COUNTS) {
    it(`names only the runtime's budget keys, each a whole number of 1 or more, for ${c.name} (a delegated run refuses any other)`, () => {
      // Arrange
      const steps = c.steps;

      // Act
      const limits = batchLimits(steps);

      // Assert
      assertRuntimeLimits(limits, `${steps}`);
    });
  }
});

describe("driverBudget", () => {
  for (const c of ONE_AT_A_TIME) {
    it(c.name, () => {
      // Arrange
      const concurrency = c.concurrency;

      // Act
      const budget = driverBudget(concurrency);

      // Assert
      deepStrictEqual(budget, BATCHES_BUDGET);
    });
  }

  it("adds the largest batch's wall time and a margin above 1, not a sum; no depth, as one at a time", () => {
    // Arrange
    const concurrency = 3;

    // Act
    const b = driverBudget(concurrency);

    // Assert
    strictEqual(b.wallTime, BATCHES_BUDGET.wallTime + batchLimits(MAX_STEPS).wallTime + WAVE_MARGIN_SECONDS);
    strictEqual(b.delegationDepth, undefined);
  });

  for (const n of WAVE_SIZES) {
    it(`grows its tool calls and tokens with each batch of a wave of ${n}: a review and the batch's git and file calls`, () => {
      // Arrange
      const perBatch = WAVE_REVIEW_CALLS + WAVE_BATCH_CALLS;

      // Act
      const b = driverBudget(n);

      // Assert
      strictEqual(b.toolCalls, BATCHES_BUDGET.toolCalls + n * perBatch, `${n}`);
      strictEqual(b.contextTokens, BATCHES_BUDGET.contextTokens + n * perBatch * TOKENS_PER_CALL, `${n}`);
    });
  }

  it("gives a wave of 4 four reviews of about 60 calls and about 16 calls a batch, past the 40 of the run's own", () => {
    // Arrange
    const concurrency = 4;

    // Act
    const b = driverBudget(concurrency);

    // Assert
    ok(b.toolCalls >= 40 + 4 * (60 + 16));
  });
});

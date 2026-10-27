// /cost: the host's account when it keeps one, else the telemetry (Orkeon #226). Run:
//   node --test tests/commands/_lib/status/cost.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { EMPTY_USAGE_REPORT, USAGE_REPORT } from "../../../support/fixtures/usage-report.ts";
import { costHarness } from "./cost.fixtures.ts";

describe("runCost", () => {
  it("tables the telemetry's figures when the host keeps no account", async () => {
    // Arrange
    const h = costHarness();
    h.telemetry.cost = { costUsd: 0.5, totalTokens: 12_000, totalCalls: 7 };

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual([view.table, view.text], [[{ costUsd: 0.5, tokens: 12_000, calls: 7 }], undefined]);
  });

  it("tables the account with its unpriced calls, and says the cost is a lower bound", async () => {
    // Arrange
    const h = costHarness();
    h.usage.answer = USAGE_REPORT;

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual(
      [view.table, view.text],
      [[{ costUsd: 0.01, tokens: 3400, calls: 2, unpricedCalls: 1 }], "1 call(s) unpriced: the cost is a lower bound"],
    );
  });

  it("shows an unpriced cost, without a note, before any priced call", async () => {
    // Arrange
    const h = costHarness();
    h.usage.answer = EMPTY_USAGE_REPORT;

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual([view.table, view.text], [[{ costUsd: "(unpriced)", tokens: 0, calls: 0, unpricedCalls: 0 }], undefined]);
  });
});

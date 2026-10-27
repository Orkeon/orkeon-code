// /usage: the one row over the ports, then the breakdown by model and by command (Orkeon #226). Run:
//   node --test tests/commands/_lib/status/usage.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { NO_USAGE_SERVICE, usageBreakdown } from "../../../../src/commands/_lib/status/usage.ts";
import { EMPTY_USAGE_REPORT, USAGE_REPORT } from "../../../support/fixtures/usage-report.ts";
import { REPORT_BREAKDOWN, usageHarness } from "./usage.fixtures.ts";

describe("usageBreakdown", () => {
  it("lists the models, then the commands newest first, then the lower-bound note", () => {
    // Arrange
    const report = USAGE_REPORT;

    // Act
    const text = usageBreakdown(report);

    // Assert
    strictEqual(text, REPORT_BREAKDOWN);
  });

  it("says what is empty before any call, without a note", () => {
    // Arrange
    const report = EMPTY_USAGE_REPORT;

    // Act
    const text = usageBreakdown(report);

    // Assert
    strictEqual(text, "by model: none named by the provider yet\nby command: no command instance yet");
  });

  it("says the host keeps no account when the service is absent", () => {
    // Arrange
    const report = undefined;

    // Act
    const text = usageBreakdown(report);

    // Assert
    strictEqual(text, NO_USAGE_SERVICE);
  });
});

describe("runUsage", () => {
  it("tables the window, the pressure, the trigger and the telemetry's figures when the host keeps no account", async () => {
    // Arrange
    const h = usageHarness();
    h.session.budget = { used: 32_000, window: 128_000 };
    h.telemetry.stats = { messageCount: 4, totalCalls: 3, totalTokens: 9000, cacheHitTokens: 700, cacheWriteTokens: 50 };
    h.telemetry.cost = { costUsd: 0.02 };

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual(view.table, [{
      usedTokens: 32_000, contextWindow: 128_000, percentLeft: "75%", pressure: "ok", autocompactAt: "91424",
      messages: 4, llmCalls: 3, llmTokens: 9000, costUsd: 0.02, cacheRead: 700, cacheWrite: 50,
    }]);
  });

  it("takes the calls, the tokens, the cost and the unpriced count from the host's account, and closes with the breakdown", async () => {
    // Arrange
    const h = usageHarness();
    h.usage.answer = USAGE_REPORT;

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual(
      [view.table?.[0], view.text],
      [{
        usedTokens: 0, contextWindow: "(default 128000)", percentLeft: "100%", pressure: "ok", autocompactAt: "91424",
        messages: 0, llmCalls: 2, llmTokens: 3400, costUsd: 0.01, unpricedCalls: 1, cacheRead: "-", cacheWrite: "-",
      }, REPORT_BREAKDOWN],
    );
  });

  it("shows an unpriced cost when the host priced no call", async () => {
    // Arrange
    const h = usageHarness();
    h.usage.answer = EMPTY_USAGE_REPORT;

    // Act
    const view = await h.run();

    // Assert
    strictEqual((view.table?.[0] as { costUsd: unknown }).costUsd, "(unpriced)");
  });

  it("names the compaction trigger the settings set", async () => {
    // Arrange
    const h = usageHarness("50k");
    h.session.budget = { used: 0, window: 100_000 };

    // Act
    const view = await h.run();

    // Assert
    strictEqual((view.table?.[0] as { autocompactAt: unknown }).autocompactAt, "50000 (compaction.trigger)");
  });

  it("degrades the row when a read fails", async () => {
    // Arrange
    const h = usageHarness();
    h.session.failure = new Error("no session");
    h.telemetry.failure = new Error("no telemetry");

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual([(view.table?.[0] as { usedTokens: unknown }).usedTokens, view.text], [0, NO_USAGE_SERVICE]);
  });
});

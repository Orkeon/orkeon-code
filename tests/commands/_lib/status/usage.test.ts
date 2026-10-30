// /usage: the one row over the ports, then the breakdown by model and by command (Orkeon #226). Run:
//   node --test tests/commands/_lib/status/usage.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { NO_USAGE_SERVICE, USAGE_LEGEND, usageBreakdown } from "../../../../src/commands/_lib/status/usage.ts";
import { EMPTY_USAGE_REPORT, USAGE_REPORT } from "../../../support/fixtures/usage-report.ts";
import {
  CACHE_LINE_CASES, CACHE_RATIO_CASES, IN_OUT_CASES, REPORT_BREAKDOWN, reportWithModelCache, usageHarness,
} from "./usage.fixtures.ts";
import { assertInOut } from "./usage.assertions.ts";

describe("usageBreakdown", () => {
  it("lists the models, then the commands newest first, then the lower-bound note", () => {
    // Arrange
    const report = USAGE_REPORT;

    // Act
    const text = usageBreakdown(report);

    // Assert
    strictEqual(text, REPORT_BREAKDOWN);
  });

  for (const c of CACHE_LINE_CASES) {
    it(c.name, () => {
      // Arrange
      const report = reportWithModelCache(c.cacheHitTokens);

      // Act
      const text = usageBreakdown(report);

      // Assert
      strictEqual(text.split("\n")[1], c.line);
    });
  }

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
    h.telemetry.stats = {
      messageCount: 4, totalCalls: 3, totalTokens: 9000, promptTokens: 8000, completionTokens: 1000, cacheHitTokens: 700,
      cacheWriteTokens: 50,
    };
    h.telemetry.cost = { costUsd: 0.02 };

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual(view.table, [{
      usedTokens: 32_000, contextWindow: 128_000, percentLeft: "75%", pressure: "ok", autocompactAt: "91424",
      messages: 4, estTokens: 0, llmCalls: 3, llmInTokens: 8000, llmOutTokens: 1000, llmReasoningTokens: "n/a",
      llmTokens: 9000, costUsd: 0.02, cacheRead: 700, cacheWrite: 50, cacheRatio: "0.09",
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
        messages: 0, estTokens: 0, llmCalls: 2, llmInTokens: 3000, llmOutTokens: 400, llmReasoningTokens: 0,
        llmTokens: 3400, costUsd: 0.01, unpricedCalls: 1, cacheRead: "n/a", cacheWrite: "n/a", cacheRatio: "n/a",
      }, `${USAGE_LEGEND}\n${REPORT_BREAKDOWN}`],
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

  it("shows the telemetry's estimated tokens", async () => {
    // Arrange
    const h = usageHarness();
    h.telemetry.stats = { estimatedTokens: 1234 };

    // Act
    const view = await h.run();

    // Assert
    strictEqual((view.table?.[0] as { estTokens: unknown }).estTokens, 1234);
  });

  for (const c of IN_OUT_CASES) {
    it(c.name, async () => {
      // Arrange
      const h = usageHarness();
      h.telemetry.stats = c.stats;
      h.usage.answer = c.report;

      // Act
      const view = await h.run();

      // Assert
      assertInOut(view.table?.[0], c.expected);
    });
  }

  for (const c of CACHE_RATIO_CASES) {
    it(c.name, async () => {
      // Arrange
      const h = usageHarness();
      h.telemetry.stats = c.stats;

      // Act
      const view = await h.run();

      // Assert
      strictEqual((view.table?.[0] as { cacheRatio: unknown }).cacheRatio, c.ratio);
    });
  }

  it("degrades the row when a read fails", async () => {
    // Arrange
    const h = usageHarness();
    h.session.failure = new Error("no session");
    h.telemetry.failure = new Error("no telemetry");

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual([(view.table?.[0] as { usedTokens: unknown }).usedTokens, view.text], [0, `${USAGE_LEGEND}\n${NO_USAGE_SERVICE}`]);
  });
});

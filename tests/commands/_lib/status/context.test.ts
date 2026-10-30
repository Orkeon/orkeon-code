// /context: the one row over the ports, with the tokens by kind when the host reports them (Orkeon #226). Run:
//   node --test tests/commands/_lib/status/context.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { kindColumns } from "../../../../src/commands/_lib/status/context.ts";
import { KINDS, contextHarness } from "./context.fixtures.ts";

describe("kindColumns", () => {
  it("names one column per kind", () => {
    // Arrange
    const kinds = KINDS;

    // Act
    const columns = kindColumns(kinds);

    // Assert
    deepStrictEqual(columns, { systemTokens: 4000, userTokens: 1000, assistantTokens: 2000, toolTokens: 900, otherTokens: 100 });
  });

  it("adds no column for a host that reports no kinds", () => {
    // Arrange
    const kinds = undefined;

    // Act
    const columns = kindColumns(kinds);

    // Assert
    deepStrictEqual(columns, {});
  });
});

describe("runContext", () => {
  it("tables the metadata, the window, the pressure, the compactions and the cache", async () => {
    // Arrange
    const h = contextHarness();
    h.telemetry.metadata = { title: "fix the gate", model: "kimi-k3", messageCount: 6, estimatedTokens: 7000 };
    h.session.budget = { used: 8000, window: 128_000 };
    h.telemetry.stats = { cacheHitTokens: 100, cacheWriteTokens: 0 };

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual(view.table, [{
      title: "fix the gate", model: "kimi-k3", messages: 6, estTokens: 7000, usedTokens: 8000, window: 128_000,
      remaining: 120_000, pressure: "ok", percentLeft: "94%", compactions: 0, cacheRead: 100, cacheWrite: 0,
    }]);
  });

  it("adds the tokens by kind when the host reports them", async () => {
    // Arrange
    const h = contextHarness();
    h.session.budget = { used: 8000, window: 128_000, byKind: KINDS };

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual(
      Object.entries(view.table?.[0] ?? {}).filter(([k]) => k.endsWith("Tokens") && k !== "usedTokens" && k !== "estTokens"),
      [["systemTokens", 4000], ["userTokens", 1000], ["assistantTokens", 2000], ["toolTokens", 900], ["otherTokens", 100]],
    );
  });

  it("degrades the row when every read fails", async () => {
    // Arrange
    const h = contextHarness();
    h.session.failure = new Error("no session");
    h.telemetry.failure = new Error("no telemetry");

    // Act
    const view = await h.run();

    // Assert
    deepStrictEqual(view.table, [{
      title: "(untitled)", model: "?", messages: 0, estTokens: 0, usedTokens: 0, window: 128_000, remaining: 128_000,
      pressure: "ok", percentLeft: "100%", compactions: 0, cacheRead: "n/a", cacheWrite: "n/a",
    }]);
  });
});

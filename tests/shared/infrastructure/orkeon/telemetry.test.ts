// The Telemetry adapter over FakeTools session_store / session_cost /
// session_stats, in both casings the runtime hands back. Run:
//   node --test tests/shared/infrastructure/orkeon/telemetry.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";

import { createTelemetry } from "../../../../src/shared/infrastructure/orkeon/telemetry.ts";
import { FakeTools } from "../../../support/doubles/fake-tools.ts";
import {
  CACHE_COUNTS, REASONING_COUNTS, PASCAL_METADATA, PASCAL_METADATA_REPLY, STATS, STATS_REPLY, TWO_MODELS_REPLY, UNREPORTED_METADATA,
  UNREPORTED_STATS,
} from "./telemetry.fixtures.ts";

describe("createTelemetry — metadata", () => {
  it("reads the PascalCase record of get_metadata", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = PASCAL_METADATA_REPLY;

    // Act
    const metadata = await createTelemetry(tools).readMetadata();

    // Assert
    deepStrictEqual(metadata, PASCAL_METADATA);
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "get_metadata" }]);
  });

  it("reads camelCase and snake_case fields under a PascalCase `Metadata`", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = {
      Metadata: { title: "t", model: "m", message_count: 2, estimatedTokens: 9, available_models: ["m"] },
    };

    // Act
    const metadata = await createTelemetry(tools).readMetadata();

    // Assert
    deepStrictEqual(metadata, { title: "t", model: "m", messageCount: 2, estimatedTokens: 9, availableModels: ["m"] });
  });

  it("reads unreported and null fields as undefined, and no declared model as []", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = { metadata: { Title: null, Model: null } };

    // Act
    const metadata = await createTelemetry(tools).readMetadata();

    // Assert
    deepStrictEqual(metadata, UNREPORTED_METADATA);
  });

  it("lets a failed call throw", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = new Error("no session_store tool");

    // Act
    const act = createTelemetry(tools).readMetadata();

    // Assert
    await rejects(act, /no session_store tool/);
  });
});

describe("createTelemetry — cost and stats", () => {
  it("reads the snake_case counters of session_cost", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionCost = { total_cost_usd: 0.0123, total_tokens: 4000, total_calls: 3, by_model: {} };

    // Act
    const cost = await createTelemetry(tools).readCost();

    // Assert
    deepStrictEqual(cost, { costUsd: 0.0123, totalTokens: 4000, totalCalls: 3 });
  });

  it("reads camelCase counters", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionCost = { totalCostUsd: 1, totalTokens: 2, totalCalls: 3 };

    // Act
    const cost = await createTelemetry(tools).readCost();

    // Assert
    deepStrictEqual(cost, { costUsd: 1, totalTokens: 2, totalCalls: 3 });
  });

  it("reads the counters of session_stats, the cache hits when reported", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStats = STATS_REPLY;

    // Act
    const stats = await createTelemetry(tools).readStats();

    // Assert
    deepStrictEqual(stats, STATS);
  });

  it("sums the prompt and completion tokens of every model, in either casing", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStats = TWO_MODELS_REPLY;

    // Act
    const s = await createTelemetry(tools).readStats();

    // Assert
    deepStrictEqual([s.promptTokens, s.completionTokens], [1500, 15]);
  });

  for (const c of CACHE_COUNTS) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.sessionStats = c.reply;

      // Act
      const s = await createTelemetry(tools).readStats();

      // Assert
      deepStrictEqual([s.cacheHitTokens, s.cacheWriteTokens], c.expected);
    });
  }

  for (const c of REASONING_COUNTS) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.sessionStats = c.reply;

      // Act
      const s = await createTelemetry(tools).readStats();

      // Assert
      strictEqual(s.reasoningTokens, c.expected);
    });
  }

  it("reads an empty result as unreported counters", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    const stats = await createTelemetry(tools).readStats();

    // Assert
    deepStrictEqual(stats, UNREPORTED_STATS);
  });

  it("lets a failed call throw", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStats = new Error("no session_stats tool");

    // Act
    const act = createTelemetry(tools).readStats();

    // Assert
    await rejects(act, /no session_stats tool/);
  });
});

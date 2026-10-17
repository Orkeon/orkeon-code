// The Telemetry adapter over FakeTools session_store / session_cost /
// session_stats, in both casings the runtime hands back. Run:
//   node_modules/.bin/tsx --test shared/infrastructure/orkeon/telemetry.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";

import { createTelemetry } from "./telemetry.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";

describe("createTelemetry — metadata", () => {
  it("reads the PascalCase record of get_metadata", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStore = {
      success: true,
      metadata: {
        Title: "fix the parser", Model: "deepseek-chat", MessageCount: 4, EstimatedTokens: 1200,
        AvailableModels: ["deepseek-chat", " deepseek-reasoner ", "DEEPSEEK-CHAT"],
      },
    };
    deepStrictEqual(await createTelemetry(tools).readMetadata(), {
      title: "fix the parser",
      model: "deepseek-chat",
      messageCount: 4,
      estimatedTokens: 1200,
      availableModels: ["deepseek-chat", "deepseek-reasoner"],
    });
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "get_metadata" }]);
  });

  it("reads camelCase and snake_case fields under a PascalCase `Metadata`", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStore = {
      Metadata: { title: "t", model: "m", message_count: 2, estimatedTokens: 9, available_models: ["m"] },
    };
    deepStrictEqual(await createTelemetry(tools).readMetadata(), {
      title: "t", model: "m", messageCount: 2, estimatedTokens: 9, availableModels: ["m"],
    });
  });

  it("reads unreported and null fields as undefined, and no declared model as []", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStore = { metadata: { Title: null, Model: null } };
    deepStrictEqual(await createTelemetry(tools).readMetadata(), {
      title: undefined, model: undefined, messageCount: undefined, estimatedTokens: undefined, availableModels: [],
    });
  });

  it("lets a failed call throw", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStore = new Error("no session_store tool");
    await rejects(createTelemetry(tools).readMetadata(), /no session_store tool/);
  });
});

describe("createTelemetry — cost and stats", () => {
  it("reads the snake_case counters of session_cost", async () => {
    const tools = new FakeTools();
    tools.replies.sessionCost = { total_cost_usd: 0.0123, total_tokens: 4000, total_calls: 3, by_model: {} };
    deepStrictEqual(await createTelemetry(tools).readCost(), { costUsd: 0.0123, totalTokens: 4000, totalCalls: 3 });
  });

  it("reads camelCase counters", async () => {
    const tools = new FakeTools();
    tools.replies.sessionCost = { totalCostUsd: 1, totalTokens: 2, totalCalls: 3 };
    deepStrictEqual(await createTelemetry(tools).readCost(), { costUsd: 1, totalTokens: 2, totalCalls: 3 });
  });

  it("reads the counters of session_stats, the cache hits when reported", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStats = {
      message_count: 6, estimated_tokens: 800, total_cost_usd: 0.5, total_tokens: 900, total_calls: 2,
      prompt_cache_hit_tokens: 300, by_model: {},
    };
    deepStrictEqual(await createTelemetry(tools).readStats(), {
      costUsd: 0.5, totalTokens: 900, totalCalls: 2, messageCount: 6, estimatedTokens: 800, cacheHitTokens: 300,
    });
  });

  it("reads an empty result as unreported counters", async () => {
    const tools = new FakeTools();
    deepStrictEqual(await createTelemetry(tools).readStats(), {
      costUsd: undefined, totalTokens: undefined, totalCalls: undefined,
      messageCount: undefined, estimatedTokens: undefined, cacheHitTokens: undefined,
    });
  });

  it("lets a failed call throw", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStats = new Error("no session_stats tool");
    await rejects(createTelemetry(tools).readStats(), /no session_stats tool/);
  });
});

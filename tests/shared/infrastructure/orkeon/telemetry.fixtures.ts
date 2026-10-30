// The session_store, session_cost and session_stats replies the createTelemetry tests read, and what they read.

/** A get_metadata reply in PascalCase, its declared models padded and repeated in another case. */
export const PASCAL_METADATA_REPLY = {
  success: true,
  metadata: {
    Title: "fix the parser", Model: "deepseek-chat", MessageCount: 4, EstimatedTokens: 1200,
    AvailableModels: ["deepseek-chat", " deepseek-reasoner ", "DEEPSEEK-CHAT"],
  },
};

export const PASCAL_METADATA = {
  title: "fix the parser",
  model: "deepseek-chat",
  messageCount: 4,
  estimatedTokens: 1200,
  availableModels: ["deepseek-chat", "deepseek-reasoner"],
};

export const UNREPORTED_METADATA = {
  title: undefined, model: undefined, messageCount: undefined, estimatedTokens: undefined, availableModels: [],
};

/** A session_stats reply in snake_case, with the older cache hit figure. */
export const STATS_REPLY = {
  message_count: 6, estimated_tokens: 800, total_cost_usd: 0.5, total_tokens: 900, total_calls: 2,
  prompt_cache_hit_tokens: 300, by_model: {},
};

export const STATS = {
  costUsd: 0.5, totalTokens: 900, totalCalls: 2, messageCount: 6, estimatedTokens: 800,
  promptTokens: undefined, completionTokens: undefined, cacheHitTokens: 300, cacheWriteTokens: undefined,
};

export const UNREPORTED_STATS = {
  costUsd: undefined, totalTokens: undefined, totalCalls: undefined,
  messageCount: undefined, estimatedTokens: undefined, promptTokens: undefined, completionTokens: undefined,
  cacheHitTokens: undefined, cacheWriteTokens: undefined,
};

/** Two models' entries, and the prompt and completion tokens summed over them. */
export const TWO_MODELS_REPLY = {
  by_model_tokens: [
    { model: "a", prompt_tokens: 1000, completion_tokens: 10 },
    { model: "b", promptTokens: 500, completionTokens: 5 },
  ],
};

export interface CacheCase {
  name: string;
  reply: unknown;
  /** The cache hit and write tokens read, in that order. */
  expected: [number | undefined, number | undefined];
}

/** The cache counts read from the per-model entries of session_stats (RT-12). */
export const CACHE_COUNTS: readonly CacheCase[] = [
  {
    name: "sums the cache read and write tokens of every model (RT-12), over the older hit figure",
    reply: {
      total_calls: 2, prompt_cache_hit_tokens: 999,
      by_model_tokens: [
        { model: "a", prompt_tokens: 1000, completion_tokens: 10, cache_read_tokens: 600, cache_write_tokens: 50 },
        { model: "b", prompt_tokens: 500, completion_tokens: 5, cache_read_tokens: 100, cache_write_tokens: 0 },
      ],
    },
    expected: [700, 50],
  },
  {
    name: "reads the PascalCase entries, and zero as reported",
    reply: { byModelTokens: [{ Model: "a", cacheReadTokens: 0, cacheWriteTokens: 0 }] },
    expected: [0, 0],
  },
  {
    name: "leaves the cache counts unreported when no model entry carries them",
    reply: { by_model_tokens: [{ model: "a", prompt_tokens: 3 }] },
    expected: [undefined, undefined],
  },
];

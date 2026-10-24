// Telemetry adapter over session_store get_metadata, session_cost and
// session_stats (its cache read and write tokens summed over by_model_tokens). The counters come back snake_case (or camelCase) and the
// metadata PascalCase from the .NET record: this is the one place that reads
// either casing, and the one place that turns the values into numbers and strings.

import type { SessionCost, SessionMetadata, SessionStats, Telemetry } from "../../application/ports.ts";
import type { SessionStoreInput } from "./runtime-tools.ts";
import { normalizeModelList } from "../../domain/model-catalog.ts";
import { asArray, pick } from "./tool-results.ts";

/** A reported number; null and absent both read as unreported. */
const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));
/** A reported string; null and absent both read as unreported. */
const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));

function costOf(r: unknown): SessionCost {
  return {
    costUsd: num(pick(r, "total_cost_usd", "totalCostUsd")),
    totalTokens: num(pick(r, "total_tokens", "totalTokens")),
    totalCalls: num(pick(r, "total_calls", "totalCalls")),
  };
}

/** The sum of one cache count over `by_model_tokens`, undefined when no entry reports it. */
function cacheSum(entries: readonly unknown[], ...names: string[]): number | undefined {
  const counts = entries.map((e) => num(pick(e, ...names))).filter((n): n is number => n !== undefined);
  return counts.length > 0 ? counts.reduce((a, b) => a + b, 0) : undefined;
}

export function createTelemetry(tools: Pick<OrkeonTools, "sessionStore" | "sessionCost" | "sessionStats">): Telemetry {
  return {
    async readMetadata(): Promise<SessionMetadata> {
      const md = pick(await tools.sessionStore({ operation: "get_metadata" } satisfies SessionStoreInput), "metadata", "Metadata");
      return {
        title: str(pick(md, "title", "Title")),
        model: str(pick(md, "model", "Model")),
        messageCount: num(pick(md, "messageCount", "MessageCount", "message_count")),
        estimatedTokens: num(pick(md, "estimatedTokens", "EstimatedTokens")),
        availableModels: normalizeModelList(pick(md, "available_models", "availableModels", "AvailableModels")),
      };
    },
    async readCost(): Promise<SessionCost> {
      return costOf(await tools.sessionCost());
    },
    async readStats(): Promise<SessionStats> {
      const s = await tools.sessionStats();
      // The cache counts per model (RT-12); an older host reported the hits alone, in one figure.
      const byModel = asArray(pick(s, "by_model_tokens", "byModelTokens"));
      return {
        ...costOf(s),
        messageCount: num(pick(s, "message_count", "messageCount")),
        estimatedTokens: num(pick(s, "estimated_tokens", "estimatedTokens")),
        cacheHitTokens: cacheSum(byModel, "cache_read_tokens", "cacheReadTokens")
          ?? num(pick(s, "prompt_cache_hit_tokens", "promptCacheHitTokens", "cache_hit_tokens")),
        cacheWriteTokens: cacheSum(byModel, "cache_write_tokens", "cacheWriteTokens"),
      };
    },
  };
}

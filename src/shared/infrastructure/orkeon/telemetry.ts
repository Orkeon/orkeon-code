// Telemetry adapter over session_store get_metadata, session_cost and
// session_stats. The counters come back snake_case (or camelCase) and the
// metadata PascalCase from the .NET record: this is the one place that reads
// either casing, and the one place that turns the values into numbers and strings.

import type { SessionCost, SessionMetadata, SessionStats, Telemetry } from "../../application/ports.ts";
import { normalizeModelList } from "../../domain/model-catalog.ts";
import { pick } from "./tool-results.ts";

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

export function createTelemetry(tools: Pick<OrkeonTools, "sessionStore" | "sessionCost" | "sessionStats">): Telemetry {
  return {
    async readMetadata(): Promise<SessionMetadata> {
      const md = pick(await tools.sessionStore({ operation: "get_metadata" }), "metadata", "Metadata");
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
      return {
        ...costOf(s),
        messageCount: num(pick(s, "message_count", "messageCount")),
        estimatedTokens: num(pick(s, "estimated_tokens", "estimatedTokens")),
        cacheHitTokens: num(pick(s, "prompt_cache_hit_tokens", "promptCacheHitTokens", "cache_hit_tokens")),
      };
    },
  };
}

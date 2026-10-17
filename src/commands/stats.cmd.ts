/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /stats — full session telemetry (SPEC §5.2).
import { orkeonTelemetry } from "../shared/infrastructure/orkeon/wiring.ts";

const telemetry = orkeonTelemetry();

defineCommand({
  name: "stats",
  description: "Show full session telemetry: message count, tokens, cost, calls.",
  handler: async (_args, ctx) => {
    const s = await telemetry.readStats();
    // Cache columns are tolerant: session_stats does not expose the DeepSeek
    // prompt-cache counters yet (needs LlmResponse usage → cost-manager wiring,
    // tracked as a follow-up) — "-" until the backend maps them.
    const cacheHit = s.cacheHitTokens;
    const tokens = s.totalTokens ?? 0;
    ctx.table([{
      messages: s.messageCount ?? 0,
      estTokens: s.estimatedTokens ?? 0,
      costUsd: s.costUsd ?? 0,
      tokens,
      calls: s.totalCalls ?? 0,
      cacheHit: cacheHit ?? "-",
      cacheRatio: cacheHit !== undefined && tokens > 0
        ? (cacheHit / tokens).toFixed(2)
        : "-",
    }]);
    return ctx.continue();
  },
});

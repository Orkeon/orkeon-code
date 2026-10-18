/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /usage — token usage against the context window with its pressure tier and the
// automatic compaction's trigger (the compaction.trigger setting when one is set),
// then the session's calls, tokens, cost and cache hits. /extra-usage, which showed
// the second half apart, is its alias.
import { orkeonConfigStore, orkeonSessionIo, orkeonTelemetry } from "../shared/infrastructure/orkeon/wiring.ts";
import type { SessionCost, SessionStats } from "../shared/application/ports.ts";
import { readCompactionTrigger } from "../shared/application/compaction/compact-session.ts";
import {
  DEFAULT_CONTEXT_WINDOW, computeTrigger, percentLeft, pressureTier,
} from "../shared/domain/compaction-thresholds.ts";

const session = orkeonSessionIo();
const telemetry = orkeonTelemetry();
const config = orkeonConfigStore();

defineCommand({
  name: "usage",
  aliases: ["extra-usage"],
  description: "Show token usage against the context window (pressure tier, compaction trigger), calls, tokens, cost and cache.",
  handler: async (_args, ctx) => {
    const [{ used, window }, s, c, trigger] = await Promise.all([
      session.readBudget().catch(() => ({ used: 0, window: 0 })),
      telemetry.readStats().catch((): SessionStats => ({})),
      telemetry.readCost().catch((): SessionCost => ({})),
      readCompactionTrigger(config),
    ]);
    ctx.table([{
      usedTokens: used,
      contextWindow: window || `(default ${DEFAULT_CONTEXT_WINDOW})`,
      percentLeft: percentLeft(used, window) + "%",
      pressure: pressureTier(used, window),
      autocompactAt: computeTrigger(window, trigger) + (trigger ? " (compaction.trigger)" : ""),
      messages: s.messageCount ?? 0,
      llmCalls: s.totalCalls ?? 0,
      llmTokens: s.totalTokens ?? 0,
      costUsd: c.costUsd ?? 0,
      cacheHit: s.cacheHitTokens ?? "-",
    }]);
    return ctx.continue();
  },
});

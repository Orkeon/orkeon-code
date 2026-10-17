/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /extra-usage (E-1) — extended usage breakdown: window pressure + telemetry
// + cost in one view (baseline 04 §/extra-usage). Cache columns stay tolerant
// ("-") until the cost-manager wiring lands (# TBD_cost_visibility, doc 12).
import { orkeonSessionIo, orkeonTelemetry } from "../shared/infrastructure/orkeon/wiring.ts";
import type { SessionCost, SessionStats } from "../shared/application/ports.ts";
import { pressureTier, percentLeft } from "../shared/domain/compaction-thresholds.ts";

const session = orkeonSessionIo();
const telemetry = orkeonTelemetry();

defineCommand({
  name: "extra-usage",
  description: "Show the extended usage breakdown: window, telemetry, cost, cache.",
  handler: async (_args, ctx) => {
    const [{ used, window }, s, c] = await Promise.all([
      session.readBudget().catch(() => ({ used: 0, window: 0 })),
      telemetry.readStats().catch((): SessionStats => ({})),
      telemetry.readCost().catch((): SessionCost => ({})),
    ]);
    ctx.table([{
      usedTokens: used,
      percentLeft: percentLeft(used, window) + "%",
      pressure: pressureTier(used, window),
      messages: s.messageCount ?? 0,
      llmCalls: s.totalCalls ?? 0,
      llmTokens: s.totalTokens ?? 0,
      costUsd: c.costUsd ?? 0,
      cacheHit: s.cacheHitTokens ?? "-",
    }]);
    return ctx.continue();
  },
});

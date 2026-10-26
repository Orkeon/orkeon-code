/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /context — the session's context: metadata, buffer size, the tokens used against
// the window, the pressure tier, the count of compaction boundaries and the
// prompt-cache tokens read and written. /ctx-viz,
// which showed the window alone, is its alias.
import { DEFAULT_CONTEXT_WINDOW, pressureTier, percentLeft } from "../../shared/domain/compaction-thresholds.ts";
import { countCompactBoundaries } from "../../shared/domain/compaction.ts";
import { orkeonSessionIo, orkeonTelemetry } from "../../shared/infrastructure/orkeon/wiring.ts";
import type { SessionStats } from "../../shared/application/ports.ts";
import { cacheColumns } from "../_lib/status/cache.ts";

const session = orkeonSessionIo();
const telemetry = orkeonTelemetry();

defineCommand({
  name: "context",
  aliases: ["ctx-viz"],
  description: "Show the current session context: title, model, messages, tokens, pressure, cache tokens.",
  handler: async (_args, ctx) => {
    const md = await telemetry.readMetadata();
    const { used, window } = await session.readBudget().catch(() => ({ used: 0, window: 0 }));
    const stats = await telemetry.readStats().catch((): SessionStats => ({}));
    const boundaries = countCompactBoundaries((await session.readMessages().catch(() => ({ stored: [] }))).stored);
    ctx.table([{
      title: md.title ?? "(untitled)",
      model: md.model ?? "?",
      messages: md.messageCount ?? 0,
      estTokens: md.estimatedTokens ?? 0,
      usedTokens: used,
      window: window || DEFAULT_CONTEXT_WINDOW,
      remaining: Math.max(0, (window || DEFAULT_CONTEXT_WINDOW) - used),
      pressure: pressureTier(used, window),
      percentLeft: percentLeft(used, window) + "%",
      compactions: boundaries,
      ...cacheColumns(stats),
    }]);
    return ctx.continue();
  },
});

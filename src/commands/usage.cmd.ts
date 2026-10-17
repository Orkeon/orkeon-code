/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /usage (E-1) — token/window usage with the graduated pressure tier (E-5).
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";
import { pressureTier, percentLeft, computeTrigger } from "../shared/domain/compaction-thresholds.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "usage",
  description: "Show token usage against the context window (pressure tier + autocompact trigger).",
  handler: async (_args, ctx) => {
    const { used, window } = await session.readBudget().catch(() => ({ used: 0, window: 0 }));
    ctx.table([{
      usedTokens: used,
      contextWindow: window || "(default 180k)",
      percentLeft: percentLeft(used, window) + "%",
      pressure: pressureTier(used, window),
      autocompactAt: computeTrigger(window),
    }]);
    return ctx.continue();
  },
});

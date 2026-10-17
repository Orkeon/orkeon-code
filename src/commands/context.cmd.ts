/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /context — session metadata + buffer size (SPEC §5.2), graduated token
// pressure (E-5: ok|warning|error + percentLeft) and compaction-boundary
// count (E-9).
import { pressureTier, percentLeft } from "../shared/domain/compaction-thresholds.ts";
import { countCompactBoundaries } from "../shared/domain/compaction.ts";
import { orkeonSessionIo, orkeonTelemetry } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();
const telemetry = orkeonTelemetry();

defineCommand({
  name: "context",
  description: "Show the current session context: title, model, messages, tokens, pressure.",
  handler: async (_args, ctx) => {
    const md = await telemetry.readMetadata();
    const { used, window } = await session.readBudget().catch(() => ({ used: 0, window: 0 }));
    const boundaries = countCompactBoundaries((await session.readMessages().catch(() => ({ stored: [] }))).stored);
    ctx.table([{
      title: md.title ?? "(untitled)",
      model: md.model ?? "?",
      messages: md.messageCount ?? 0,
      estTokens: md.estimatedTokens ?? 0,
      pressure: pressureTier(used, window),
      percentLeft: percentLeft(used, window) + "%",
      compactions: boundaries,
    }]);
    return ctx.continue();
  },
});

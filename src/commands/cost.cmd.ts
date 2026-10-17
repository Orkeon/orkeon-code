/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /cost — cumulative session cost + tokens (SPEC §5.2).
import { orkeonTelemetry } from "../shared/infrastructure/orkeon/wiring.ts";

const telemetry = orkeonTelemetry();

defineCommand({
  name: "cost",
  description: "Show cumulative session cost in USD and token usage.",
  handler: async (_args, ctx) => {
    const c = await telemetry.readCost();
    ctx.table([{
      costUsd: c.costUsd ?? 0,
      tokens: c.totalTokens ?? 0,
      calls: c.totalCalls ?? 0,
    }]);
    return ctx.continue();
  },
});

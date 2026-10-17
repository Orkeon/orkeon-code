/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /ctx-viz — token breakdown of the current context (SPEC §7 / design 02).
// Backing: token_budget. No new tool/service.
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "ctx-viz",
  description: "Visualise the context window: tokens used, remaining, and percent full.",
  handler: async (_args, ctx) => {
    const { used, window } = await session.readBudget();
    const remaining = Math.max(0, window - used);
    const percentUsed = window ? Math.round((used / window) * 100) : 0;
    ctx.table([{ usedTokens: used, windowTokens: window, remaining, percentUsed }]);
    return ctx.continue();
  },
});

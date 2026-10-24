/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /hooks — the session's hook registry: list, add, remove (_lib/hooks.ts, which says where the hooks run).
import { rawTokens } from "./_lib/args.ts";
import { runHooks } from "./_lib/hooks.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "hooks",
  description: "List, add or remove declarative hooks (pre-tool|post-tool|stop).",
  handler: async (args, ctx) => {
    const outcome = await runHooks(rawTokens(args), session);
    if (outcome.table !== undefined) ctx.table(outcome.table);
    return ctx.continue(outcome.text);
  },
});

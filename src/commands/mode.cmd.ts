/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /mode [<mode>|show] — cycle, show or set the session-default permission mode
// used by the assistant when the prompt carries no explicit "mode:" prefix.
// Entry point: wires the session into _lib/mode.ts (runMode).
import { rawTokens } from "./_lib/args.ts";
import { runMode } from "./_lib/mode.ts";
import { showView } from "./_lib/view.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "mode",
  description: "Cycle, show or set the session-default permission mode of the assistant.",
  handler: async (args, ctx) => showView(ctx, await runMode(rawTokens(args), { session, log: ctx.log })),
});

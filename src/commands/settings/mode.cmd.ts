/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /mode [<mode>|show] — cycle, show or set the session-default permission mode
// used by the assistant when the prompt carries no explicit "mode:" prefix. Typed
// by its alias /plan, it toggles plan mode: leaving plan returns to `default`, never
// to what preceded it (that could be bypassPermissions).
// Entry point: wires the session into _lib/settings/mode.ts (runMode).
import { rawTokens, typedCommand } from "../_lib/args.ts";
import { runMode } from "../_lib/settings/mode.ts";
import { showView } from "../_lib/view.ts";
import { orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "mode",
  aliases: ["plan"],
  description: "Cycle, show or set the session-default permission mode of the assistant; /plan toggles plan mode (read-only).",
  handler: async (args, ctx) =>
    showView(ctx, await runMode(rawTokens(args), { session, log: ctx.log }, typedCommand(ctx.command?.rawInput, "mode"))),
});

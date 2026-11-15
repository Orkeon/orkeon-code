/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /effort [<level>]: the session's reasoning-effort level. Entry point: wires the session into
// _lib/settings/effort.ts (runEffort), with the reader of what the session's model takes. The ladder and the forwarding rule are pure and tested in
// shared/domain/agent-policy/behavior-flags.ts.
import { rawTokens } from "../_lib/args.ts";
import { runEffort } from "../_lib/settings/effort.ts";
import { showView } from "../_lib/view.ts";
import { orkeonChooser, orkeonConfigStore, orkeonReasoning, orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();
const config = orkeonConfigStore();
const reasoning = orkeonReasoning();

defineCommand({
  name: "effort",
  description: "Show or set the session reasoning-effort level (low|medium|high|xhigh|max).",
  handler: async (args, ctx) =>
    showView(ctx, await runEffort(rawTokens(args), { session, config, reasoning, chooser: orkeonChooser(ctx) })),
});

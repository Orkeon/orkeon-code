/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /route [on|off|why]: the routing of the crews a command launches to the cheapest profile that fits. Entry point:
// wires the settings, the session and the decision model into _lib/settings/route.ts (runRoute).
import { rawTokens } from "../_lib/args.ts";
import { runRoute } from "../_lib/settings/route.ts";
import { showView } from "../_lib/view.ts";
import { orkeonConfigStore, orkeonDecisionModel, orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "route",
  description: "Show, turn on or off the routing of crews to the cheapest LLM profile that fits (why: the last choices).",
  handler: async (args, ctx) =>
    showView(ctx, await runRoute(rawTokens(args), { config: orkeonConfigStore(), session, decision: orkeonDecisionModel() })),
});

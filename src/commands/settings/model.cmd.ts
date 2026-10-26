/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /model — show the effective model, or switch the model used by subsequent turns
// without relaunching: the preference is session state that the loop passes to
// each model call (baseline 04 §/model). Entry point: wires the session and the
// telemetry into _lib/settings/model.ts (runModel), which holds the sub-commands.
import { rawTokens } from "../_lib/args.ts";
import { runModel } from "../_lib/settings/model.ts";
import { showView } from "../_lib/view.ts";
import { orkeonSessionIo, orkeonTelemetry } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();
const telemetry = orkeonTelemetry();

defineCommand({
  name: "model",
  description: "Show the effective model for the next turn, or switch it without relaunching.",
  handler: async (args, ctx) =>
    showView(ctx, await runModel(rawTokens(args), { session, telemetry, log: ctx.log })),
});

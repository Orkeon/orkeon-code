/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /cost — cumulative session cost and tokens, from the host's account when it keeps one (Orkeon
// #226), else the telemetry. Entry point: wires the telemetry and the host's usage service into
// _lib/status/cost.ts (runCost).
import { runCost } from "../_lib/status/cost.ts";
import { showView } from "../_lib/view.ts";
import { orkeonTelemetry } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createUsageReader } from "../../shared/infrastructure/orkeon/usage.ts";

const deps = { telemetry: orkeonTelemetry() };

defineCommand({
  name: "cost",
  description: "Show cumulative session cost in USD and token usage; the calls nobody priced, when the host keeps the account.",
  handler: async (_args, ctx) => showView(ctx, await runCost({ ...deps, usage: createUsageReader(ctx.services) })),
});

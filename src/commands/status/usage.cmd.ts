/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /usage — token usage against the context window with its pressure tier and the automatic
// compaction's trigger, then the session's calls, tokens, cost and the prompt-cache tokens, and
// the usage by model and by command the host accounts (Orkeon #226). /extra-usage, which showed the
// second half apart, is its alias. Entry point: wires the session, the telemetry, the settings and
// the host's usage service into _lib/status/usage.ts (runUsage).
import { runUsage } from "../_lib/status/usage.ts";
import { showView } from "../_lib/view.ts";
import { orkeonConfigStore, orkeonSessionIo, orkeonTelemetry } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createUsageReader } from "../../shared/infrastructure/orkeon/usage.ts";

const deps = { session: orkeonSessionIo(), telemetry: orkeonTelemetry(), config: orkeonConfigStore() };

defineCommand({
  name: "usage",
  aliases: ["extra-usage"],
  description: "Show token usage against the context window (pressure tier, compaction trigger), calls, tokens, cost and the cache tokens read and written, then the usage by model and by command.",
  handler: async (_args, ctx) => showView(ctx, await runUsage({ ...deps, usage: createUsageReader(ctx.services) })),
});

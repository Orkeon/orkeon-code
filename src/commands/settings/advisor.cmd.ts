/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /advisor (B-12) — read, set or disable the advisor model, and run the secondary
// review it exists for (baseline 04 §/advisor: "Read, set, or disable the advisor
// model used for secondary review of agent outputs").
//
//   /advisor                 show the setting and what it is for
//   /advisor <model>         set it (persisted in .orkeon/config.json, key advisor.model)
//   /advisor off             disable it
//   /advisor review          run the second opinion on the last exchange, now
//
// The setting is a /config key (B-6), not a private state blob: it belongs to the
// declared key space, it is validated on the way in, and it survives
// /clear — the point of choosing a reviewer is that the choice sticks.
//
// The model is checked against the host's declared catalogue and WARNED about, not
// refused (same rule as /model). The logic is _lib/settings/advisor.ts; this file wires it and
// starts the advisor crew when it is asked for.
import { rawTokens } from "../_lib/args.ts";
import { runAdvisorCommand } from "../_lib/settings/advisor.ts";
import { launchCrew, withLlmProfile, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonConfigStore, orkeonTelemetry } from "../../shared/infrastructure/orkeon/wiring.ts";

const config = orkeonConfigStore();
const telemetry = orkeonTelemetry();

defineAsyncCommand({
  name: "advisor",
  description: "Show, set or disable the advisor model, or run a second opinion on the last answer.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const outcome = await runAdvisorCommand(rawTokens(args), { config, telemetry, log: ctx.log });
    if ("launch" in outcome) return launchCrew(await withLlmProfile({ crews: createCrewHost(ctx.services), log: ctx.log }, orkeonConfigStore()), "advisor", {});
    for (const line of outcome.lines) ctx.writeLine(line);
    return;
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "advisor", "✓ advisor → "),
});

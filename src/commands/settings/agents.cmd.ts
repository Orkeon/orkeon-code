/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /agents — list, create, edit and delete saved agent configurations, stored in
// /workspace/.orkeon/agents.json beside the crews the host discovers (baseline 04
// §/agents). Entry point: wires the files and the crew host into _lib/agents.ts
// (runAgents), which holds the sub-commands.
import { rawTokens } from "../_lib/args.ts";
import { runAgents } from "../_lib/agents.ts";
import { showView } from "../_lib/view.ts";
import { orkeonFiles } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";

const files = orkeonFiles();

defineCommand({
  name: "agents",
  description: "List, add, show or remove saved agent configurations (.orkeon/agents.json).",
  handler: async (args, ctx) =>
    showView(ctx, await runAgents(rawTokens(args), { files, crews: createCrewHost(ctx.services) })),
});

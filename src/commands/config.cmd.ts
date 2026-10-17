/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /config — read/write settings over a declared key space, in two layers: the
// file /workspace/.orkeon/config.json, overridden by the session state bag until
// /clear (baseline 04 §/config). Entry point: wires the config store into
// _lib/config.ts (runConfig), which holds the sub-commands.
import { rawTokens } from "./_lib/args.ts";
import { runConfig } from "./_lib/config.ts";
import { showView } from "./_lib/view.ts";
import { orkeonConfigStore } from "../shared/infrastructure/orkeon/wiring.ts";

const config = orkeonConfigStore();

defineCommand({
  name: "config",
  description: "List, get, set or unset settings over the declared key space (file + session layers).",
  handler: async (args, ctx) => showView(ctx, await runConfig(rawTokens(args), { config })),
});

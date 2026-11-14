/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /config — read/write settings over a declared key space, in two layers: the
// file /workspace/.orkeon/config.json, overridden by the session state bag until
// /clear (baseline 04 §/config). Entry point: wires the config store into
// _lib/settings/config.ts (runConfig), which holds the sub-commands.
import { rawTokens } from "../_lib/args.ts";
import { runConfig } from "../_lib/settings/config.ts";
import { showView } from "../_lib/view.ts";
import { orkeonConfigStore, orkeonReasoning, orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const config = orkeonConfigStore();
const session = orkeonSessionIo();
const reasoning = orkeonReasoning();

defineCommand({
  name: "config",
  description: "List, get, set or unset settings over the declared key space (file + session layers).",
  handler: async (args, ctx) => showView(ctx, await runConfig(rawTokens(args), { config, session, reasoning })),
});

/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /output-style [<name>|show]: the session's answer style. Entry point: wires the session into
// _lib/settings/output-style.ts (runOutputStyle).
//
// NO top-level `export` in a *.cmd.ts: the loader bundles the file and Jint evaluates it in SCRIPT mode, where
// `export` is a syntax error. tests/repository/command-surface.test.ts pins the rule.
import { rawTokens } from "../_lib/args.ts";
import { runOutputStyle } from "../_lib/settings/output-style.ts";
import { showView } from "../_lib/view.ts";
import { orkeonChooser, orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "output-style",
  description: "Show or set the session's answer style (consumed by the assistant's prompt).",
  handler: async (args, ctx) =>
    showView(ctx, await runOutputStyle(rawTokens(args), { session, chooser: orkeonChooser(ctx) })),
});

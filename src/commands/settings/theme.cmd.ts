/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /theme [<name>|show]: the console's palette for this session.
// Entry point: wires the command context into _lib/settings/theme.ts (runTheme).
import { rawTokens } from "../_lib/args.ts";
import { runTheme } from "../_lib/settings/theme.ts";
import { showView } from "../_lib/view.ts";
import { orkeonChooser } from "../../shared/infrastructure/orkeon/wiring.ts";

defineCommand({
  name: "theme",
  description: "Show or set the console's palette for this session (dark|light|none).",
  handler: async (args, ctx) =>
    showView(ctx, await runTheme(rawTokens(args), { console: ctx, chooser: orkeonChooser(ctx) })),
});

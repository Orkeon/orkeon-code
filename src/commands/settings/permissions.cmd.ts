/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /permissions — display the effective permission surface (mode, catalogue,
// rules, what the host gate holds) and manage the session's allow/deny rules.
// Entry point: wires the session, the host gate's rules, the settings (for
// `tools.extra`) and the host's tools into _lib/permissions.ts (runPermissions),
// which holds the sub-commands.
import { rawTokens } from "../_lib/args.ts";
import { runPermissions } from "../_lib/permissions.ts";
import { showView } from "../_lib/view.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue,
} from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();
const config = orkeonConfigStore();

defineCommand({
  name: "permissions",
  description: "Show the permission surface; add, remove, list or clear the session's tool rules.",
  handler: async (args, ctx) =>
    showView(ctx, await runPermissions(rawTokens(args), {
      session, gate: createPermissionRules(ctx.services), config, catalogue: orkeonToolCatalogue(ctx.services),
    })),
});

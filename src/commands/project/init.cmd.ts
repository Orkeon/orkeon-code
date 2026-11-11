/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /init — write AGENTS.md, the project's instructions file, by running the project-init crew.
import { launchCrew, withRoutedProfile, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonConfigStore, orkeonRouting } from "../../shared/infrastructure/orkeon/wiring.ts";
import { WORKSPACE } from "../../shared/domain/vfs.ts";

defineAsyncCommand({
  name: "init",
  description: "Analyse the workspace and write AGENTS.md, the instructions file (an existing CLAUDE.md is merged).",
  maxConcurrent: 1,
  dispatch: async (_args, ctx) => launchCrew(await withRoutedProfile({ crews: createCrewHost(ctx.services), log: ctx.log }, orkeonConfigStore(), orkeonRouting(), { crew: "project-init", brief: String(ctx.command?.rawInput ?? "") }), "project-init", { cwd: WORKSPACE }),
  completed: (result, ctx) => writeCompleted(ctx, result, "init", "✓ "),
});

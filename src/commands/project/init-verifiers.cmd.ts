/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /init-verifiers — author verification skills via the init-verifiers crew (SPEC §5.1).
import { launchCrew, withRoutedProfile, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonConfigStore, orkeonRouting } from "../../shared/infrastructure/orkeon/wiring.ts";
import { WORKSPACE } from "../../shared/domain/vfs.ts";

defineAsyncCommand({
  name: "init-verifiers",
  description: "Detect test tooling and author verification skills for uncovered zones.",
  maxConcurrent: 1,
  dispatch: async (_args, ctx) => launchCrew(await withRoutedProfile({ crews: createCrewHost(ctx.services), log: ctx.log }, orkeonConfigStore(), orkeonRouting(), { crew: "init-verifiers", brief: String(ctx.command?.rawInput ?? "") }), "init-verifiers", { cwd: WORKSPACE }),
  completed: (result, ctx) => writeCompleted(ctx, result, "init-verifiers", "✓ "),
});

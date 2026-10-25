/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /init-verifiers — author verification skills via the init-verifiers crew (SPEC §5.1).
import { launchCrew, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { WORKSPACE } from "../../shared/domain/vfs.ts";

defineAsyncCommand({
  name: "init-verifiers",
  description: "Detect test tooling and author verification skills for uncovered zones.",
  maxConcurrent: 1,
  dispatch: (_args, ctx) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "init-verifiers", { cwd: WORKSPACE }),
  completed: (result, ctx) => writeCompleted(ctx, result, "init-verifiers", "✓ "),
});

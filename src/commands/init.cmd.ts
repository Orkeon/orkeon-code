/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /init — generate a CLAUDE.md by running the project-init crew (SPEC §5.1).
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";

defineAsyncCommand({
  name: "init",
  description: "Analyse the workspace and generate a CLAUDE.md.",
  maxConcurrent: 1,
  dispatch: (_args, ctx) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "project-init", { cwd: "/workspace" }),
  completed: (result, ctx) => writeCompleted(ctx, result, "init", "✓ "),
});

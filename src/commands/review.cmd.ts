/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /review — multi-lens code review of staged changes via the code-review crew (SPEC §5.1).
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";

defineAsyncCommand({
  name: "review",
  description: "Run a multi-facet code review on staged changes.",
  maxConcurrent: 1,
  args: {
    files: { type: "string[]", required: false },
    commit: { type: "string", required: false },
  },
  dispatch: (args, ctx) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "code-review", { files: args.files ?? [], commit: args.commit ?? "" }),
  completed: (result, ctx) => writeCompleted(ctx, result, "review", "✓ review → "),
});

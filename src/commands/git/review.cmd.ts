/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /review [--lens <lens>] — multi-lens code review of staged changes via the code-review crew; --lens
// narrows it to one lens (correctness for a bug hunt), outranking the review.lenses setting.
import { launchCrew, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";

defineAsyncCommand({
  name: "review",
  description: "Run a multi-lens code review on staged changes; --lens correctness|security|style keeps one lens.",
  maxConcurrent: 1,
  args: {
    files: { type: "string[]", required: false },
    commit: { type: "string", required: false },
    lens: { type: "string", required: false, choices: ["correctness", "security", "style"] },
  },
  dispatch: (args, ctx) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "code-review", { files: args.files ?? [], commit: args.commit ?? "", lenses: args.lens ?? "" }),
  completed: (result, ctx) => writeCompleted(ctx, result, "review", "✓ review → "),
});

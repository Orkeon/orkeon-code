/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /branch [name] — show the current git branch, or check out the given one
// (baseline 04 §/branch).
//
// B-11 finding, fixed here rather than only tabled: the baseline says the handler
// "optionally prompts the user for confirmation (especially if uncommitted changes
// exist)" and the first version checked out unconditionally. `git checkout` on a dirty tree
// either fails with git's own error or CARRIES the changes onto the new branch —
// and the second outcome is the one that loses work quietly, because it looks like
// a successful switch.
//
// A refusal, not a prompt: the REPL's confirmation channel is not available to a
// synchronous command handler here (the same reason /commit's gate is a separate
// step), and between refusing and silently carrying changes across, refusing is the
// one that cannot cost work. The message names both ways out.
import { orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { rawTokens } from "../_lib/args.ts";
import { runBranch } from "../_lib/git/branch.ts";
import { showView } from "../_lib/view.ts";

const shell = orkeonShell();

defineCommand({
  name: "branch",
  description: "Show the current git branch, or check out the given one (refuses on a dirty tree).",
  handler: async (args, ctx) => showView(ctx, await runBranch(rawTokens(args), { shell, log: ctx.log })),
});

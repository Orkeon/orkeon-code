/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /diff [--staged] [pathspec…] — unified diff of the working tree, or of the
// staged changes (baseline 04 §/diff).
//
// B-11 deepening. Two gaps against the baseline:
//   1. `staged` is a DECLARED option there; here every token was appended to
//      `git diff` verbatim. Not an injection (the shell tool bans operators and
//      allowlists git) but an unbounded surface: `--output=/tmp/x` is a plain git
//      option that writes a file, and nothing stood in the way.
//   2. an empty diff printed "(no output)", where the baseline says
//      "No changes to show." — the difference matters because "(no output)" reads
//      like the command itself failed to produce any.
// Options and pathspecs are now allowlisted, refusals are named, and the scope is
// stated so `--staged` shows up in the OUTPUT and not only in the input.
import { orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { rawTokens } from "../_lib/args.ts";
import { runDiff } from "../_lib/git/diff.ts";
import { showView } from "../_lib/view.ts";

const shell = orkeonShell();

defineCommand({
  name: "diff",
  description: "Show the working-tree diff, or the staged diff with --staged.",
  handler: async (args, ctx) => showView(ctx, await runDiff(rawTokens(args), { shell, log: ctx.log })),
});

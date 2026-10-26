/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /commit — draft + create a Conventional-Commits commit via the git-commit crew (SPEC §5.1).
//
// B-1: the launch is GATED. Until this item, `/commit` staged the entire working
// tree and committed it with no confirmation and no permission check — the
// framework's IPermissionGate only fires inside the `act` tool-calling loop, and
// the git-commit crew commits from its body, so nothing consulted anything
// (round-40 finding `commit-no-confirmation`). The original gates every
// destructive action through its decision table (baseline 08 §Decision table).
//
// Three things now stand between the command and a rewritten repository:
//   1. the effective permission mode is threaded into the crew inputs, exactly
//      as assistant.cmd.ts threads it to main-loop, and the crew refuses the
//      read-only modes before spending anything;
//   2. an interactive session must confirm a plan that names the file list (every
//      change, untracked files too, or the paths named; never the work folder);
//   3. a NON-interactive session without `--yes` is refused, not auto-approved —
//      the one case where a confirmation prompt silently degrades into consent.
//
// The gate is _lib/commit.ts; this file wires it to the session, the prompt and the
// pull-request context, then launches the crew with the input it builds.
import { rawTokens } from "../_lib/args.ts";
import { runCommitCommand } from "../_lib/commit.ts";
import { launchCrew, writeCompleted } from "../_lib/dispatch.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import { orkeonSessionIo, orkeonToolCatalogue } from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();

defineAsyncCommand({
  name: "commit",
  description: "Draft and create a conventional commit of the changed files or the paths named, the work folder left out unless named (confirms first; --yes skips; --push pushes; --pr opens the pull request).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const outcome = await runCommitCommand(rawTokens(args), {
      session,
      // ctx.prompt needs an interactive console: in a headless session it throws or answers no boolean.
      confirm: (question) => ctx.prompt({ type: "confirm", message: question, default: false }),
      write: (line) => ctx.writeLine(line),
      log: ctx.log,
      pr: { catalogue: () => orkeonToolCatalogue(ctx.services), rules: () => createPermissionRules(ctx.services), session },
    });
    if ("refused" in outcome) return outcome;
    return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "git-commit", outcome.input);
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "commit"),
});

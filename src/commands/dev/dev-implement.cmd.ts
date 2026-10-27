/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /dev-implement F<n> [<code> | <path>/<CODE>-PLAN.md] [--close] [--pr] — run one batch sheet test-first.
// Parses the arguments here and hands the work to crews/dev-implement: per step, red tests by the test author,
// then the least code by the implementer, each checked by code; the build and the whole suite as jobs. The host's
// gate must be on, and the dev rule sets with the step's two allow rules (run_tests, run_build) are put in it
// first (_lib/dev-step.ts). The chain then runs in `completed`: the audit (/dev-verify), and on VALID the close
// (commit, push, pull request). --close runs the close alone; `— correction: <finding>` appends the finding to the
// sheet as a new step, then runs it. The chain keeps no state here: the crew's answer carries the audit's input
// (mode, hooks, effort), and `completed`, awaited by the host (Orkeon #220), reads the session's mode, rules and
// github tool again before the close: a mode that no longer allows it refuses the close with the command to type,
// else the fresh context rides in the launch input, and the batch record's context, saved at the dispatch, serves
// only when that read fails. Every chained launch goes through launchCrew (its chain-depth refusal); the chain
// climbs (at most three hops from a typed command), no `chain: "continue"` here.
import { rawTokens } from "../_lib/args.ts";
import { launchChained, nextLaunch, runDevImplementDispatch } from "../_lib/dev/dev-implement.ts";
import { reapplyStepRules } from "../_lib/dev-step.ts";
import { launchCrew } from "../_lib/dispatch.ts";
import { readPullRequestContext } from "../_lib/pr-context.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonSessionIo, orkeonShell, orkeonToolCatalogue,
} from "../../shared/infrastructure/orkeon/wiring.ts";

const session = orkeonSessionIo();
const config = orkeonConfigStore();

defineAsyncCommand({
  name: "dev-implement",
  description: "Run a dev batch test-first: red tests, then the least code, each checked by code; then the audit and, on VALID, the close (--close: the close alone; — correction: <finding> adds a gap as a step).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const outcome = await runDevImplementDispatch(rawTokens(args), {
      session, config, files: orkeonFiles(), shell: orkeonShell(),
      gate: () => createPermissionRules(ctx.services), catalogue: () => orkeonToolCatalogue(ctx.services),
      write: (line) => ctx.writeLine(line),
    });
    if ("refused" in outcome) return outcome;
    return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "dev-implement", outcome.input, outcome.details);
  },
  // Async: the host awaits it before the next completion (Orkeon #220). Caught whole: a failure prints its line,
  // never a bare `Error in completed('dev-implement')`.
  completed: async (result, ctx) => {
    try {
      const step = await nextLaunch(result, {
        reapply: (crew) => reapplyStepRules(createPermissionRules(ctx.services), crew),
        context: () => readPullRequestContext({
          catalogue: () => orkeonToolCatalogue(ctx.services), rules: () => createPermissionRules(ctx.services), session,
        }),
      });
      for (const line of step.lines) ctx.writeLine(line);
      if (step.launch === undefined) return;
      const lines = launchChained(step.launch, (crew, input) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, crew, input));
      for (const line of lines) ctx.writeLine(line);
    } catch (e) {
      ctx.writeLine(`✗ the dev-implement chain stopped (${String((e as Error)?.message ?? e).split("\n")[0]}): type the next step yourself`);
    }
  },
});

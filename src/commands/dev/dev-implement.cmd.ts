/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /dev-implement F<n> [<code> | <path>/<CODE>-PLAN.md] [--close] [--pr] — run one batch sheet test-first.
// Parses the arguments here and hands the work to crews/dev-implement: per step, red tests by the test author,
// then the least code by the implementer, each checked by code; the build and the whole suite as jobs. The host's
// gate must be on, and the dev rule sets with the step's two allow rules (run_tests, run_build) are put in it
// first (_lib/dev-step.ts). The chain then runs in `completed`: the audit (/dev-verify), and on VALID the close
// (commit, push, pull request). --close runs the close alone; `— correction: <finding>` appends the finding to the
// sheet as a new step, then runs it. The chain keeps no state here: the crew's answer carries the audit's input
// (mode, hooks, effort), and the pull-request context read at dispatch is saved by the crew in the batch record,
// where the chained close reads it. Every chained launch goes through launchCrew (its chain-depth refusal).
import { rawTokens } from "../_lib/args.ts";
import { launchChained, nextLaunch, runDevImplementDispatch } from "../_lib/dev/dev-implement.ts";
import { reapplyStepRules } from "../_lib/dev-step.ts";
import { launchCrew } from "../_lib/dispatch.ts";
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
  completed: (result, ctx) => {
    const step = nextLaunch(result, (crew) => reapplyStepRules(createPermissionRules(ctx.services), crew));
    for (const line of step.lines) ctx.writeLine(line);
    if (step.launch === undefined) return;
    const lines = launchChained(step.launch, (crew, input) => launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, crew, input));
    for (const line of lines) ctx.writeLine(line);
  },
});

/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /dev-implement F<n> [<code> | <path>/<CODE>-PLAN.md] [--close] [--pr] — run one batch sheet test-first.
// Parses the arguments here and hands the work to crews/dev-implement: per step, red tests by the test author,
// then the least code by the implementer, each checked by code; the build and the whole suite as jobs. The host's
// gate must be on, and the dev rule sets with the step's two allow rules (run_tests, run_build) are put in it
// first (_lib/dev-step.ts). The chain then runs in `completed`: the audit (/dev-verify), and on VALID the close
// (commit, push, pull request). --close runs the close alone; `— correction: <finding>` appends the finding to the
// sheet as a new step, then runs it. The chain keeps no state here: the crew's answer carries the audit's input
// (mode, hooks, effort), and the pull-request context read at dispatch is saved by the crew in the batch record,
// where the chained close reads it. Every chained launch goes through launchCrew (its chain-depth refusal).
import { rawTokens } from "./_lib/args.ts";
import { chainStep, parseDevImplementArgs } from "./_lib/dev-implement.ts";
import { markActiveWorkflow, reapplyStepRules, startDevStep } from "./_lib/dev-step.ts";
import { launchCrew } from "./_lib/dispatch.ts";
import { readPullRequestContext, writingModeRefusal } from "./_lib/pr-context.ts";
import { storedEffort } from "./_lib/effort.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonSessionIo, orkeonShell, orkeonToolCatalogue,
} from "../shared/infrastructure/orkeon/wiring.ts";
import { countOpenSteps } from "../crews/dev-implement/application/count-open-steps.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

defineAsyncCommand({
  name: "dev-implement",
  description: "Run a dev batch test-first: red tests, then the least code, each checked by code; then the audit and, on VALID, the close (--close: the close alone; — correction: <finding> adds a gap as a step).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevImplementArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const prContext = await readPullRequestContext({
      catalogue: () => orkeonToolCatalogue(ctx.services), rules: () => createPermissionRules(ctx.services), session: deps.session,
    });
    const line = writingModeRefusal(String(prContext.permissionMode ?? ""), "/dev-implement");
    if (line !== null) {
      ctx.writeLine(line);
      return { refused: line };
    }
    const start = await startDevStep("dev-implement", {
      ...deps, gate: createPermissionRules(ctx.services), catalogue: orkeonToolCatalogue(ctx.services),
    });
    if (!start.ok) {
      ctx.writeLine(start.line);
      return { refused: start.line };
    }
    for (const line of start.lines) ctx.writeLine(line);
    const unrecorded = await markActiveWorkflow(deps.session, parsed.args);
    if (unrecorded !== null) ctx.writeLine(unrecorded);
    // The budget is sized to the open steps of the sheet (the crew sizes for its default when they cannot be counted).
    // A correction adds one step, appended by the crew after this count.
    const open = parsed.args.close
      ? undefined
      : await countOpenSteps({ files: orkeonFiles(), shell: orkeonShell(), config: deps.config }, parsed.args.batch, parsed.args.plan);
    const steps = open === undefined || parsed.args.correction === null ? open : open + 1;
    const input = {
      ...parsed.args, ...start.input, effort: await storedEffort(deps.session), ...(steps === undefined ? {} : { steps }), ...prContext,
    };
    return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "dev-implement", input, {
      ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length,
    });
  },
  completed: (result, ctx) => {
    if (!result.success) {
      ctx.writeLine(`✗ the dev-implement chain failed: ${result.error ?? "unknown"}`);
      return;
    }
    const step = chainStep(String(result.payload ?? ""));
    for (const line of step.lines) ctx.writeLine(line);
    if (step.launch === undefined) return;
    // No dispatch runs before a chained launch: the gate is checked and the step's rules put back here.
    const refusal = reapplyStepRules(createPermissionRules(ctx.services), step.launch.crew === "dev-verify" ? "dev-verify" : "dev-implement");
    if (refusal !== null) {
      ctx.writeLine(`✗ ${refusal}`);
      ctx.writeLine(`then type ${step.launch.instead}`);
      return;
    }
    try {
      const launched = launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, step.launch.crew, step.launch.input);
      if ("refused" in launched) {
        ctx.writeLine(`✗ ${launched.refused}`);
        ctx.writeLine(`then type ${step.launch.instead}`);
      }
    } catch (e) {
      ctx.writeLine(`✗ ${step.launch.crew} could not be launched (${String((e as Error)?.message ?? e).split("\n")[0]}): type ${step.launch.instead}`);
    }
  },
});

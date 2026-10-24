/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /dev-implement F<n> [<code> | <path>/<CODE>-PLAN.md] [--close] [--pr] — run one batch sheet test-first.
// Parses the arguments here and hands the work to crews/dev-implement: per step, red tests by the test author,
// then the least code by the implementer, each checked by code; the build and the whole suite as jobs. The host's
// gate must be on, and the dev rule sets with the step's two allow rules (run_tests, run_build) are put in it
// first (_lib/dev-step.ts). The chain then runs in `completed`: the audit (/dev-verify), and on VALID the close
// (commit, push, pull request). --close runs the close alone.
import { rawTokens } from "./_lib/args.ts";
import { chainStep, parseDevImplementArgs } from "./_lib/dev-implement.ts";
import { markActiveWorkflow, startDevStep } from "./_lib/dev-step.ts";
import { launchCrew } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonSessionIo, orkeonShell, orkeonToolCatalogue,
} from "../shared/infrastructure/orkeon/wiring.ts";
import { countOpenSteps } from "../crews/dev-implement/application/count-open-steps.ts";
import { GITHUB_TOOL } from "../shared/domain/git/pull-request.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

/** What the close needs to open the pull request itself: the github tool, the session's mode and rules. Read at
 *  dispatch, kept for the close the chain launches from `completed`, which the runtime does not await. */
let prContext: Record<string, unknown> = {};
/** The /hooks registry read at dispatch, carried to every crew of the chain (the audit runs under it too). */
let chainHooks: unknown[] = [];

async function readPullRequestContext(ctx: any): Promise<Record<string, unknown>> {
  let githubTool = false;
  let permissionRules: string[] = [];
  let permissionMode = "";
  try {
    githubTool = orkeonToolCatalogue(ctx.services).find(GITHUB_TOOL) !== undefined;
  } catch { /* no tools service: the command is handed over */ }
  try {
    const rules = createPermissionRules(ctx.services);
    if (rules.available()) permissionRules = rules.list();
  } catch { /* no rules service: none */ }
  try {
    permissionMode = (await deps.session.resolveEffectiveSessionMode()).mode;
  } catch { /* unknown mode: the opener refuses and hands the command over */ }
  return { githubTool, permissionRules, permissionMode };
}

defineAsyncCommand({
  name: "dev-implement",
  description: "Run a dev batch test-first: red tests, then the least code, each checked by code; then the audit and, on VALID, the close (--close: the close alone).",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevImplementArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
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
    prContext = await readPullRequestContext(ctx);
    chainHooks = start.hooks;
    // The budget is sized to the open steps of the sheet (the crew sizes for its default when they cannot be counted).
    const steps = parsed.args.close
      ? undefined
      : await countOpenSteps({ files: orkeonFiles(), shell: orkeonShell(), config: deps.config }, parsed.args.batch, parsed.args.plan);
    const input = {
      ...parsed.args, hooks: start.hooks, ...(steps === undefined ? {} : { steps }), ...(parsed.args.close ? prContext : {}),
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
    const input = step.launch.crew === "dev-implement"
      ? { ...step.launch.input, ...prContext, hooks: chainHooks }
      : { ...step.launch.input, hooks: chainHooks };
    try {
      createCrewHost(ctx.services).launch(step.launch.crew, input);
    } catch (e) {
      ctx.writeLine(`✗ ${step.launch.crew} could not be launched (${String((e as Error)?.message ?? e).split("\n")[0]}): type ${step.launch.instead}`);
    }
  },
});

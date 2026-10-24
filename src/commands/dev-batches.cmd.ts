/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /dev-batches [<code>] [--pr] — run a plan's batches one after the other, in the order their dependencies allow,
// and close the plan with one push and one pull request. The crew (crews/dev-batches) reads the plan and its log
// `.orkeon/dev/<code>/batches-state.md` and names the next batch; this command's `completed` launches it:
// /dev-implement on the batch, its audit (/dev-verify), on VALID its close (a commit, not pushed), then the crew
// again, which logs the batch and names the next one. The answers are told apart by the crew that gave them
// (_lib/dev-batches.ts). A stop (BLOCKED, a GAPS verdict, a Blocking review question) hands over to the user;
// `/dev-batches` again goes on from the first batch not done, its sheet's ticks kept. The chain is bounded by
// the runtime (MaxChainDepth, 8 crews from a typed command: about two batches): past it, the refusal says to type
// `/dev-batches`, which goes on with the run the crew recorded. No state here: the crew keeps the run's code and
// what this dispatch read (mode, rules, github tool, hooks, effort) in its run record. Every launch goes through
// launchCrew (its chain-depth refusal); the gate is checked and the step's rules put back before each one.
import { rawTokens } from "./_lib/args.ts";
import { batchesChainStep, parseDevBatchesArgs } from "./_lib/dev-batches.ts";
import { reapplyStepRules, startDevStep } from "./_lib/dev-step.ts";
import { launchCrew } from "./_lib/dispatch.ts";
import { storedEffort } from "./_lib/effort.ts";
import { readPullRequestContext } from "./_lib/pr-context.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../shared/infrastructure/orkeon/permission-rules.ts";
import { orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue } from "../shared/infrastructure/orkeon/wiring.ts";
import { policyFor } from "../shared/domain/agent-policy/mode-policy.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

defineAsyncCommand({
  name: "dev-batches",
  description: "Run a plan's batches one after the other in their dependencies' order (implement, audit, commit each), then push once and open one pull request; no code: go on with the run in progress.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevBatchesArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const prContext = await readPullRequestContext({
      catalogue: () => orkeonToolCatalogue(ctx.services), rules: () => createPermissionRules(ctx.services), session: deps.session,
    });
    const mode = prContext.permissionMode;
    if (mode !== "" && policyFor(mode).readOnly) {
      const line = `✗ refused: the session mode ${mode} is read-only, and /dev-batches writes files, commits and pushes: /mode default, then run it again`;
      ctx.writeLine(line);
      return { refused: line };
    }
    // The batches run /dev-implement's step: its rule sets and its two allow rules (run_tests, run_build).
    const start = await startDevStep("dev-implement", {
      ...deps, gate: createPermissionRules(ctx.services), catalogue: orkeonToolCatalogue(ctx.services),
    });
    if (!start.ok) {
      ctx.writeLine(start.line);
      return { refused: start.line };
    }
    for (const line of start.lines) ctx.writeLine(line);
    // A run named by its code carries what was read here; without one, the crew reads its run record back.
    const input = parsed.args.code === null
      ? { pr: parsed.args.pr }
      : { code: parsed.args.code, pr: parsed.args.pr, ...start.input, effort: await storedEffort(deps.session), ...prContext };
    return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "dev-batches", input, {
      ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length,
    });
  },
  completed: (result, ctx) => {
    if (!result.success) {
      ctx.writeLine(`✗ the dev-batches chain failed (${result.intent || "a crew"}): ${result.error ?? "unknown"}`);
      ctx.writeLine("then type /dev-batches: the run goes on from the first batch not done");
      return;
    }
    const step = batchesChainStep(String(result.intent ?? ""), String(result.payload ?? ""));
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

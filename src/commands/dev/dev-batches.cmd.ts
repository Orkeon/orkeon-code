/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /dev-batches — three shapes, read by _lib/dev/dev-batches.ts (parseDevBatchesArgs):
//   /dev-batches [<code>] [--pr] [--concurrency n]   run a plan's batches in the order their dependencies allow and
//     close the plan with one push and one pull request; n from 2 to 4 runs each wave of disjoint batches at once,
//     each under its own worktree (refused before any launch in a mode that asks before shell commands);
//   /dev-batches <code> F<n> [--close [--pr]] [— correction: <finding>]   run one batch sheet test-first (the
//     dev-implement crew), then its audit and, on VALID, its close; --close runs the close alone; a correction
//     appends the finding to the sheet as a new step, then runs it;
//   /dev-batches <code> F<n> --audit [fast|full|resume] [--gate-only]   audit one batch (the dev-verify crew).
// The aliases /dev-implement and /dev-verify keep the lines typed before they folded in here. Before each launch
// the host's gate is checked and the step's rule sets put in it (_lib/dev-step.ts). The dispatch records the chain
// it launches in the session, and `completed`, awaited by the host (Orkeon #220), reads it to tell apart the answers
// of a run, of one batch and of one audit (devBatchesCompleted): a run's hops keep the depth of the instance they
// run for (`{ chain: "continue" }`, Orkeon #221), so a plan of any length closes in one `/dev-batches`; a batch's
// chain climbs (at most three hops). Before each hop that writes, the session's mode and rules are read again: a
// mode that no longer allows it refuses the hop with the command to type, else the fresh context rides in the launch
// input. A batch's close inside a run never pushes (sent push: false); the plan's close pushes once and opens the
// one pull request. Every launch goes through launchCrew (its chain-depth refusal).
import { rawTokens, typedCommand } from "../_lib/args.ts";
import {
  batchesHopFailedLine, batchesLaunchInput, batchesModeRefusal, devBatchesCompleted, launchCompletedHop,
  parseDevBatchesArgs, recordChain, runDevVerifyDispatch,
} from "../_lib/dev/dev-batches.ts";
import { runDevImplementDispatch } from "../_lib/dev/dev-implement.ts";
import { reapplyStepRules, startDevStep, writeModeRefusal } from "../_lib/dev-step.ts";
import { launchCrew, withLlmProfile } from "../_lib/dispatch.ts";
import { storedEffort } from "../_lib/effort.ts";
import { readPullRequestContext } from "../_lib/pr-context.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonSessionIo, orkeonShell, orkeonToolCatalogue,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import type { CommandRuntimeContext } from "../.orkeon/orkeon-cli.d.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

/** The session's context as it is now: the mode, the rules and the github tool, read at the dispatch and before each hop. */
const contextReader = (ctx: CommandRuntimeContext) => () => readPullRequestContext({
  catalogue: () => orkeonToolCatalogue(ctx.services), rules: () => createPermissionRules(ctx.services), session: deps.session,
});

/** The run of a plan: the mode checked, the step started, what was read riding in the crew's input. */
async function runDispatch(args: Parameters<typeof batchesLaunchInput>[0], ctx: CommandRuntimeContext) {
  const prContext = await contextReader(ctx)();
  const line = writeModeRefusal(String(prContext.permissionMode ?? ""), "dev-batches", "writes files, commits and pushes")
    ?? batchesModeRefusal(args, String(prContext.permissionMode ?? ""));
  if (line !== null) {
    ctx.writeLine(line);
    return { refused: line };
  }
  // The batches run the dev-implement step: its rule sets and its two allow rules (run_tests, run_build).
  const start = await startDevStep("dev-implement", {
    ...deps, gate: createPermissionRules(ctx.services), catalogue: orkeonToolCatalogue(ctx.services),
  });
  if (!start.ok) {
    ctx.writeLine(start.line);
    return { refused: start.line };
  }
  for (const line of start.lines) ctx.writeLine(line);
  const input = batchesLaunchInput(args, { ...start.input, effort: await storedEffort(deps.session), ...prContext });
  return { input, details: { ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length } };
}

defineAsyncCommand({
  name: "dev-batches",
  aliases: ["dev-implement", "dev-verify"],
  description: "Run a plan's batches in dependency order (implement, audit, commit each), --concurrency n at once in worktrees, then one PR; <code> F<n>: one batch; F<n> --audit: its audit.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevBatchesArgs(rawTokens(args), typedCommand(ctx.command?.rawInput, "dev-batches"));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const dispatchDeps = {
      ...deps, gate: () => createPermissionRules(ctx.services), catalogue: () => orkeonToolCatalogue(ctx.services),
      write: (line: string) => ctx.writeLine(line),
    };
    const outcome = parsed.route === "run"
      ? await runDispatch(parsed.args, ctx)
      : parsed.route === "batch"
        ? await runDevImplementDispatch(parsed.args, { ...dispatchDeps, files: orkeonFiles(), shell: orkeonShell() })
        : await runDevVerifyDispatch(parsed.args, dispatchDeps);
    if ("refused" in outcome) return outcome;
    const unrecorded = await recordChain(deps.session, parsed.route);
    if (unrecorded !== null) {
      ctx.writeLine(unrecorded);
      return { refused: unrecorded };
    }
    const crew = parsed.route === "run" ? "dev-batches" : parsed.route === "batch" ? "dev-implement" : "dev-verify";
    return launchCrew(await withLlmProfile({ crews: createCrewHost(ctx.services), log: ctx.log }, orkeonConfigStore()), crew, outcome.input, outcome.details);
  },
  // Async: the host awaits it before the next completion (Orkeon #220). Caught whole: a failure prints its line
  // and the command to type, never a bare `Error in completed('dev-batches')`.
  completed: async (result, ctx) => {
    try {
      // No dispatch runs before a chained launch: the gate is checked and the step's rules put back here.
      const completion = await devBatchesCompleted(result, {
        session: deps.session, reapply: (crew) => reapplyStepRules(createPermissionRules(ctx.services), crew), context: contextReader(ctx),
      });
      for (const line of completion.lines) ctx.writeLine(line);
      for (const line of await launchCompletedHop(completion, { crews: createCrewHost(ctx.services), log: ctx.log }, orkeonConfigStore())) ctx.writeLine(line);
    } catch (e) {
      ctx.writeLine(batchesHopFailedLine(e));
    }
  },
});

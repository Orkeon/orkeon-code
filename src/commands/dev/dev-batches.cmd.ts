/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /dev-batches [<code>] [--pr] [--concurrency n] — run a plan's batches one after the other, in the order their
// dependencies allow, and close the plan with one push and one pull request. With n from 2 to 4 the crew runs each
// wave of disjoint batches at once, each under its own worktree, and answers the next wave: launched again here.
// Above 1 is refused before any launch in a mode that asks before shell commands. The crew (crews/dev-batches) reads the plan and its log
// `.orkeon/dev/<code>/batches-state.md` and names the next batch; this command's `completed` launches it:
// /dev-implement on the batch, its audit (/dev-verify), on VALID its close (a commit, sent push: false), then the crew
// again, which logs the batch and names the next one. The answers are told apart by the crew that gave them
// (_lib/dev/dev-batches.ts). A stop (BLOCKED, a GAPS verdict, a Blocking review question) hands over to the user;
// `/dev-batches` again goes on from the first batch not done, its sheet's ticks kept. Every hop `completed` launches
// keeps the depth of the instance it runs for (`{ chain: "continue" }`, Orkeon #221), so a plan of any length
// closes in one `/dev-batches`: the runtime's MaxChainDepth (8) no longer stops it after about two batches. No
// state here: the crew keeps the run's code and what this dispatch read (mode, rules, github tool, hooks, effort) in
// its run record, and `completed`, awaited by the host (Orkeon #220), reads the session's mode and rules again
// before each hop that writes: a mode that no longer allows it refuses the hop with the command to type, else the
// fresh context rides in the launch input and the crews read it rather than the record's. A batch's close never
// pushes (sent push: false, and a typed close of a batch of the run in progress reads the record); the plan's close
// pushes once and opens the one pull request (a batch's close is given no github tool). Every launch goes through
// launchCrew (its chain-depth refusal); the gate is checked and the step's rules put back before each one.
import { rawTokens } from "../_lib/args.ts";
import {
  batchesHopFailedLine, batchesLaunchInput, batchesModeRefusal, batchesNextLaunch, launchBatchesHop, parseDevBatchesArgs,
} from "../_lib/dev/dev-batches.ts";
import { reapplyStepRules, startDevStep, writeModeRefusal } from "../_lib/dev-step.ts";
import { launchCrew } from "../_lib/dispatch.ts";
import { storedEffort } from "../_lib/effort.ts";
import { readPullRequestContext } from "../_lib/pr-context.ts";
import { createCrewHost } from "../../shared/infrastructure/orkeon/crew-host.ts";
import { createPermissionRules } from "../../shared/infrastructure/orkeon/permission-rules.ts";
import { orkeonConfigStore, orkeonSessionIo, orkeonToolCatalogue } from "../../shared/infrastructure/orkeon/wiring.ts";
import type { CommandRuntimeContext } from "../.orkeon/orkeon-cli.d.ts";

const deps = { session: orkeonSessionIo(), config: orkeonConfigStore() };

/** The session's context as it is now: the mode, the rules and the github tool, read at the dispatch and before each hop. */
const contextReader = (ctx: CommandRuntimeContext) => () => readPullRequestContext({
  catalogue: () => orkeonToolCatalogue(ctx.services), rules: () => createPermissionRules(ctx.services), session: deps.session,
});

defineAsyncCommand({
  name: "dev-batches",
  description: "Run a plan's batches in their dependencies' order (implement, audit, commit each), one at a time or --concurrency n at once in worktrees, then one pull request; no code: the run in progress goes on.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const parsed = parseDevBatchesArgs(rawTokens(args));
    if (!parsed.ok) {
      ctx.writeLine(parsed.text);
      return { refused: parsed.text };
    }
    const prContext = await contextReader(ctx)();
    const line = writeModeRefusal(String(prContext.permissionMode ?? ""), "dev-batches", "writes files, commits and pushes")
      ?? batchesModeRefusal(parsed.args, String(prContext.permissionMode ?? ""));
    if (line !== null) {
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
    // What was read here goes with every typed run, a run without a code too: the crew keeps it in its run
    // record for the runs the chain launches (a mode or a rule changed since the first run counts).
    const input = batchesLaunchInput(parsed.args, { ...start.input, effort: await storedEffort(deps.session), ...prContext });
    return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "dev-batches", input, {
      ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length,
    });
  },
  // Async: the host awaits it before the next completion (Orkeon #220). Caught whole: a failure prints its line
  // and the command to type, never a bare `Error in completed('dev-batches')`.
  completed: async (result, ctx) => {
    try {
      // No dispatch runs before a chained launch: the gate is checked and the step's rules put back here.
      const step = await batchesNextLaunch(result, {
        reapply: (crew) => reapplyStepRules(createPermissionRules(ctx.services), crew), context: contextReader(ctx),
      });
      for (const line of step.lines) ctx.writeLine(line);
      if (step.launch === undefined) return;
      for (const line of launchBatchesHop(step.launch, { crews: createCrewHost(ctx.services), log: ctx.log })) ctx.writeLine(line);
    } catch (e) {
      ctx.writeLine(batchesHopFailedLine(e));
    }
  },
});

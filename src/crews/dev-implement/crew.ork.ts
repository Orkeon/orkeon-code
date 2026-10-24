// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevImplement crew (/dev-implement). Composition root: one agent holds the tools of the two
// writing roles of a batch step (the test author, the implementer) and the autonomous run_tests
// and run_build; application/run-dev-implement runs each step as two acts of it, each act with
// its own tools and its own callbacks (the role's deny rules over the pack's layout), observes
// the tree and the tests itself and ticks the sheet. The build and the whole suite then run as
// shell jobs. With close: true it commits the batch's files once /dev-verify found it VALID.
//
// Input (globalThis.inputs): { batch: "F<n>", plan?: string | null, close?: boolean, pr?: boolean,
//                              correction?: string (the finding of an audit's gap), steps?: number,
//                              hooks?: the /hooks registry, effort?: "low" | "medium" | "high" | null,
//                              memoryRecall?: false (a session rule denies it: the agent gets none),
//                              permissionMode?, permissionRules?, githubTool? (the close's pull request;
//                              the run saves them in the batch record, the chained close reads them back) }
// Answer: JSON { lines: string[], next?: { crew: "dev-verify", input } }, read by the command's completed.
//
// Budget (G-29): sized to the steps of the run, implement-budget.ts; the close has its own.

import { AgentBuilder, CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import { runBuildTool, runTestsTool, scriptToolSlot } from "../../shared/infrastructure/orkeon/script-tools.ts";
import type { WrappedTools } from "../../shared/application/dev/wrapped-tools.ts";
import {
  orkeonConfigStore, orkeonCostIndex, orkeonFiles, orkeonMemoryToolPorts, orkeonPullRequestOpener, orkeonShell, orkeonShellJobs,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { memoryReadTools, memoryRecallOn, memoryRecallTools } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { devToolCallbacks } from "../../shared/infrastructure/orkeon/tool-callbacks.ts";
import { parseSessionRules } from "../../shared/domain/git/pull-request.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { implementBudget } from "./domain/implement-budget.ts";
import { CREW_TOOLS } from "./domain/roles.ts";
import { reportingWrites } from "./application/report-writes.ts";
import { runDevImplement } from "./application/run-dev-implement.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore(), jobs: orkeonShellJobs() };
// run_tests and run_build: built here, bound by the body to the run's wrapped tools (its pack, its rules, its logs).
const toolSlot = scriptToolSlot<WrappedTools>();
const flag = (v: unknown): boolean => v === true || v === "true";
const effort = providerEffort(inputs().effort);
// memory_recall is attached unless a session rule denies every call of it (the gate would refuse each one).
const memoryOn = memoryRecallOn(inputs());
const today = (): string => new Date().toISOString().slice(0, 10);

const builder = AgentBuilder()
  .name("dev-implement")
  .role("Batch implementer")
  .goal("Run the steps of one batch sheet test-first: red tests by the test author, then the least code that turns them green")
  .tools([...CREW_TOOLS])
  .withAutonomousTool(runTestsTool(ToolBuilder, toolSlot))
  .withAutonomousTool(runBuildTool(ToolBuilder, toolSlot))
  .withAutonomousTools(memoryRecallTools(ToolBuilder, orkeonMemoryToolPorts, memoryOn))
  .maxIterations(60)
  .body(async (_input: any, ctx: any) => {
    const args = inputs();
    return await runDevImplement(
      {
        batch: args.batch, plan: args.plan, close: flag(args.close), pr: flag(args.pr), correction: args.correction,
        permissionMode: args.permissionMode, permissionRules: args.permissionRules, githubTool: args.githubTool,
        hooks: args.hooks, effort: args.effort, memoryRecall: args.memoryRecall,
      },
      {
        ...ports, log: ctx.log, toolSlot, costIndex: orkeonCostIndex(), today,
        // The close's opener, for the context read at the launch (the chained close reads it from the batch record).
        openerFor: (pr) => orkeonPullRequestOpener({ mode: pr.permissionMode, rules: parseSessionRules(pr.permissionRules), asked: false }),
        // Each role's act runs under its own callbacks: the host's gate first, then the step's rule sets, the
        // role's roots and the /hooks the command passed. run_tests and run_build check their own commands.
        // `wrote` hears each write those callbacks let through: code keeps a role's own changes, not its runs' output.
        // `writable`: the test author's stubs, which its own root denies leave open (never a rule set's or the gate's).
        roleLlm: (role, layout, wrote, writable) => createLlm(ctx.llm, reportingWrites(devToolCallbacks(
          { step: "dev-implement", role, layout, writable, hooks: args.hooks, readTools: memoryReadTools(memoryOn) },
          { shell: ports.shell, log: ctx.log },
        ), wrote), { effort }),
      },
    );
  });
const implementer = (effort === undefined ? builder : builder.effort(effort)).build();


publishCrew(
  CrewBuilder()
    .name("dev-implement")
    .process("sequential")
    .budget(implementBudget({ steps: inputs().steps, close: flag(inputs().close) }))
    .withAgent(implementer)
    .build(),
);

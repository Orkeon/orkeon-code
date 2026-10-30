// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevImplement crew (dev-implement). Composition root: one agent holds the tools of the two
// writing roles of a batch step (the test author, the implementer) and the autonomous run_tests
// and run_build; application/run-dev-implement runs each step as two acts of it, each act with
// its own tools and its own callbacks (the role's deny rules over the pack's layout), observes
// the tree and the tests itself and ticks the sheet. The build and the whole suite then run as
// shell jobs. With close: true it commits the batch's files once dev-verify found it VALID.
//
// Input (globalThis.inputs): { batch: "F<n>", plan?: string | null, close?: boolean, pr?: boolean, push?: false,
//                              correction?: string (the finding of an audit's gap), steps?: number,
//                              stale?: string[] (/dev-batches' `stale:` lines: they end the RED and GREEN prompts),
//                              hooks?: the /hooks registry, effort?: "low" | "medium" | "high" | "xhigh" | "max" | null,
//                              memoryRecall?: false (a session rule denies it: the agent gets none),
//                              permissionMode?, permissionRules?, githubTool? (the close's pull request;
//                              the run saves them in the batch record, the chained close reads them back) }
// Answer: JSON { lines: string[], next?: { crew: "dev-verify", input } }, read by the command's completed.
//
// Budget (G-29): sized to the steps of the run, implement-budget.ts; the close has its own.

import { CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import { orkeonAgent } from "../../shared/infrastructure/orkeon/wiring.ts";
import { runBuildTool, runTestsTool, scriptToolSlot } from "../../shared/infrastructure/orkeon/script-tools.ts";
import type { WrappedTools } from "../../shared/application/dev/wrapped-tools.ts";
import { memoryRecallOn, memoryRecallTools } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { agentTools, implementDeps } from "../../shared/infrastructure/orkeon/dev-deps.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { implementBudget } from "./domain/implement-budget.ts";
import { CREW_TOOLS } from "./domain/roles.ts";
import { implementInputs, runDevImplement } from "./application/run-dev-implement.ts";

// run_tests and run_build: built here, bound by the body to the run's wrapped tools (its pack, its rules, its logs).
const toolSlot = scriptToolSlot<WrappedTools>();
// memory_recall's ports: over the tools of the body that runs (dev-deps.ts), never the global's.
const bodyTools = agentTools();
const flag = (v: unknown): boolean => v === true || v === "true";
const effort = providerEffort(inputs().effort);
// memory_recall is attached unless a session rule denies every call of it (the gate would refuse each one).
const memoryOn = memoryRecallOn(inputs());

const builder = orkeonAgent()
  .name("dev-implement")
  .role("Batch implementer")
  .goal("Run the steps of one batch sheet test-first: red tests by the test author, then the least code that turns them green")
  .tools([...CREW_TOOLS])
  .withAutonomousTool(runTestsTool(ToolBuilder, toolSlot))
  .withAutonomousTool(runBuildTool(ToolBuilder, toolSlot))
  .withAutonomousTools(memoryRecallTools(ToolBuilder, bodyTools.memoryPorts(), memoryOn))
  .maxIterations(60)
  .body(async (_input: any, ctx: any) => {
    const args = inputs();
    bodyTools.bind(ctx.tools);
    // implementInputs keeps a `push: false` (/dev-batches' closes: the plan's branch is pushed once, at its end).
    // The ports, each role's Llm under its callbacks and the close's opener: dev-deps.ts, over this body's tools.
    return await runDevImplement(implementInputs(args), implementDeps(ctx, { hooks: args.hooks, effort, memoryOn, toolSlot }));
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

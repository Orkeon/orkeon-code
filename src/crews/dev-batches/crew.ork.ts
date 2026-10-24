// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevBatches crew (/dev-batches). Composition root: one agent, the reviewer's read tools, whose body is
// application/run-dev-batches: it reads the plan, its sheets, its verdicts and the log
// `.orkeon/dev/<code>/batches-state.md`, logs what came of the batch the chain just ran, then stops (a human
// decides), closes the plan (one push, one pull request) or names the next batch in the dependencies' order,
// after the preflight and, for a batch whose dependencies just closed, one review of its sheet (inline, read
// tools only). Sequential, it launches nothing: a crew cannot (crew-host.ts), the command's `completed` does.
// With `concurrency` 2 to 4, the driver runs a wave itself (application/run-wave.ts): each batch in a batch agent
// spawned under its own worktree (`.workingRoot`), its steps, its audit inline and its close run in code there
// (runBatchChain), every batch at once; the driver, only writer of the main checkout, merges them in id order.
//
// Input (globalThis.inputs): { code?: string (absent: the run .orkeon/dev/batches-active.json names),
//                              pr?: boolean, after?: string[] (the last lines the batch's chain answered),
//                              concurrency?: 1 to 4 (absent: 1, or the record's; above 1 in bypassPermissions),
//                              permissionMode?, permissionRules?, githubTool?, hooks?, effort?, memoryRecall? }
// Answer: JSON { lines: string[], next?: { crew: "dev-implement" | "dev-batches", input } }, read by the command's
//   completed: dev-implement for the next batch of a sequential run, dev-batches for a parallel run's next wave.
// Run standalone:  bash scripts/run-crew.sh src/crews/dev-batches/crew.ork.ts --inputs '{"code":"prune"}'
//   (it logs the batch it names as launched and launches nothing: drive that batch with /dev-implement)
//
// Budget: domain/batches-budget.ts (the driver's, and each batch agent's in code: L8P-D12).

import { AgentBuilder, CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import { orkeonConfigStore, orkeonFiles, orkeonPullRequestOpener, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { memoryDirOf } from "../../shared/application/shared-memory/memory-settings.ts";
import { harvestAfterGaps } from "../../shared/application/shared-memory/harvest-after-gaps.ts";
import type { WrappedTools } from "../../shared/application/dev/wrapped-tools.ts";
import { devToolCallbacks } from "../../shared/infrastructure/orkeon/tool-callbacks.ts";
import { runBuildTool, runTestsTool, runValidationTool, scriptToolSlot } from "../../shared/infrastructure/orkeon/script-tools.ts";
import type { ValidationCalls } from "../../shared/infrastructure/orkeon/script-tools.ts";
import { memoryRecallTools } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { agentTools, createSpend, gitTopUnder, implementDeps, verifyDeps } from "../../shared/infrastructure/orkeon/dev-deps.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { REVIEWER_CHARTER } from "../../shared/domain/dev/reviewer-charter.ts";
import { parseSessionRules } from "../../shared/domain/git/pull-request.ts";
import { CREW_TOOLS } from "../dev-implement/domain/roles.ts";
import { implementInputs, runDevImplement } from "../dev-implement/application/run-dev-implement.ts";
import { AUDITOR_CHARTER } from "../dev-verify/domain/auditor-charter.ts";
import { runDevVerify } from "../dev-verify/application/run-dev-verify.ts";
import { batchLimits, driverBudget } from "./domain/batches-budget.ts";
import { runBatchChain } from "./application/run-wave.ts";
import type { BatchOutcome, BatchRun } from "./application/run-wave.ts";
import type { BatchesContext } from "./application/run-dev-batches.ts";
import { runDevBatches } from "./application/run-dev-batches.ts";

const effort = providerEffort(inputs().effort);
// A batch agent writes and audits: the implementer's tools and the auditor's read tools.
const BATCH_TOOLS = [...new Set([...CREW_TOOLS, ...charterCatalogue(AUDITOR_CHARTER)])];

/** One batch's agent, under its worktree: its own script-tool slots, spend and tools bound by its body. */
function batchAgent(run: BatchRun, context: BatchesContext) {
  const limits = batchLimits(run.steps);
  const spend = createSpend(limits.toolCalls);
  const toolSlot = scriptToolSlot<WrappedTools>();
  const validationSlot = scriptToolSlot<ValidationCalls>();
  const bodyTools = agentTools();
  const memoryOn = context.memoryRecall !== false;
  const batchEffort = providerEffort(context.effort ?? undefined);
  const options = { hooks: context.hooks, effort: batchEffort, memoryOn, root: run.root, spend };
  // What the sequential run hands /dev-implement (run-dev-batches.ts): no github tool, its close never pushed.
  const launch = {
    plan: run.code, hooks: context.hooks, effort: context.effort,
    permissionMode: context.permissionMode, permissionRules: context.permissionRules, githubTool: false,
    ...(context.memoryRecall === false ? { memoryRecall: false } : {}),
  };
  const builder = AgentBuilder()
    .name(`batch-${run.batch}`)
    .role("Batch runner")
    .goal(`Run batch ${run.batch} of ${run.code} test-first under its worktree, audit it and commit it there`)
    .workingRoot(run.root)
    .tools(BATCH_TOOLS)
    .withAutonomousTool(runTestsTool(ToolBuilder, toolSlot, run.root))
    .withAutonomousTool(runBuildTool(ToolBuilder, toolSlot, run.root))
    .withAutonomousTool(runValidationTool(ToolBuilder, validationSlot, run.root))
    .withAutonomousTools(memoryRecallTools(ToolBuilder, bodyTools.memoryPorts(run.root), memoryOn, run.root))
    .maxIterations(Math.max(60, AUDITOR_CHARTER.maxIterations))
    .body(async (_input: any, ctx: any) => {
      bodyTools.bind(ctx.tools);
      // The audit acts inline on this agent's Llm (no background child, no board: L8P-D2); the harvest after
      // GAPS is the driver's, on the main checkout.
      const outcome = await runBatchChain(run, launch, {
        implement: (input) => runDevImplement(implementInputs(input), implementDeps(ctx, { ...options, toolSlot })),
        verify: (input) => runDevVerify(input, verifyDeps(ctx, { ...options, validationSlot })),
        spend,
      });
      return JSON.stringify(outcome);
    });
  return { builder: batchEffort === undefined ? builder : builder.effort(batchEffort), timeout: limits.wallTime * 1000 };
}

/** The outcome a batch agent answered (its JSON); its text as the lines of a BLOCKED one otherwise. */
function outcomeOf(run: BatchRun, answered: unknown): BatchOutcome {
  const text = typeof answered === "string" ? answered : JSON.stringify(answered);
  try {
    const value = JSON.parse(text) as BatchOutcome;
    if (value !== null && value.batch === run.batch && Array.isArray(value.lines)) return value;
  } catch {
    // Not the chain's JSON.
  }
  return { batch: run.batch, verdict: "BLOCKED", lines: [`BLOCKED — the batch agent answered: ${text.split("\n")[0]}`], spent: 0 };
}

const builder = AgentBuilder()
  .name("dev-batches")
  .role("Batch driver")
  .goal("Run a plan's batches in the order their dependencies allow, and close the plan with one pull request")
  // The reviewer's read tools, for the review of the next batch; the rest is code's.
  .tools(charterCatalogue(REVIEWER_CHARTER))
  .maxIterations(REVIEWER_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    // The ports over this body's tools: a parallel wave's batch agents run beside it under other roots, where the
    // global `tools` refuses a call.
    const ports = { shell: orkeonShell(ctx.tools), files: orkeonFiles(ctx.tools), config: orkeonConfigStore(ctx.tools) };
    const clock = () => new Date();
    return await runDevBatches(inputs(), {
      ...ports, log: ctx.log, clock,
      // The host's gate first, then these callbacks: the dev rule sets again and the run's /hooks (a chained run
      // reads them from its record, as it does the /effort). The reviewer only reads: the plan step's guard fits it.
      reviewerFor: (c) => createLlm(ctx.llm, devToolCallbacks({ step: "dev-plan", hooks: c.hooks }, { shell: ports.shell, log: ctx.log, memoryDir: memoryDirOf(ports.config) }),
        { effort: providerEffort(c.effort ?? undefined) }),
      openerFor: (c) => orkeonPullRequestOpener({ mode: c.permissionMode, rules: parseSessionRules(c.permissionRules), asked: false }, ctx.tools),
      // A parallel wave: each batch in its own agent under its worktree, bounded in code (batches-budget.ts).
      runBatch: async (run, context) => {
        const agent = batchAgent(run, context);
        const answered = await crew.runAgent(ctx.spawn(agent.builder), {}, { signal: ctx.signal, timeout: agent.timeout });
        return outcomeOf(run, answered);
      },
      // git under the first worktree, as an agent rooted there sees it (L8P-D11, Orkeon/orkeon#188).
      probe: async (root) => {
        const probe = AgentBuilder()
          .name(`probe-${root.slice(root.lastIndexOf("/") + 1)}`)
          .role("Worktree probe")
          .goal("Say git's top under the worktree")
          .workingRoot(root)
          .tools(["shell_command"])
          .body(async (_i: any, pctx: any) => JSON.stringify(await gitTopUnder(pctx.tools, root)));
        const answered = await crew.runAgent(ctx.spawn(probe), {}, { signal: ctx.signal, timeout: 60_000 });
        return JSON.parse(String(answered)) as { exitCode: number; top: string };
      },
      // M-7 after a batch's GAPS, on the main checkout's verdicts (a batch agent never harvests).
      afterGaps: (work) => harvestAfterGaps({ ...ports, clock, log: ctx.log }, work),
    });
  });
const driver = (effort === undefined ? builder : builder.effort(effort)).build();

const crew = CrewBuilder()
  .name("dev-batches")
  .process("sequential")
  .budget(driverBudget(inputs().concurrency))
  .withAgent(driver)
  .build();

publishCrew(crew);

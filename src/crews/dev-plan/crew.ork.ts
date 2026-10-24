// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevPlan crew (/dev-plan). Composition root: it builds the planner agent and wires application/run-dev-plan,
// which stops on a Blocking open question, inventories the code by the index, asks the model for the plan as
// JSON (once more on a refused answer), writes <CODE>-PLAN.md, one sheet per batch and plan.json, then has the
// read-only reviewer question the plan once. The reviewer's act runs in a background child, `dev-reviewer`
// (the reviewer's charter: read tools only, plan mode), which /tasks lists and stops while it runs, and repairs by a new run once it has ended
// (A-3, shared/application/agents/child-agent.ts); on a host without background children it runs inline.
//
// Input (globalThis.inputs): { source: string | null, replace?: boolean, hooks?: the /hooks registry,
//                              effort?: "low" | "medium" | "high" | null, concurrency?: number, maxInstances?: number }
// Run standalone:  bash scripts/run-crew.sh src/crews/dev-plan/crew.ork.ts --inputs '{"source":"prune"}'
//
// Budget: up to 59 index and batch_anchors calls by code, at most 40 folder listings for the anchors (one per folder for the run,
// both attempts sharing them), about 30 other file and git calls, two extract calls and one review of 20
// iterations (about 3 tool calls each): 59 + 40 + 30 + 2 + 60 = 191, so toolCalls 240 leaves a margin that 200
// did not. The reviewer runs as a child: the runtime gives it what the parent has left at its spawn
// (SpawnAgentScriptTool CreateChildBudget), so the 60 is its own estimate, not a cap.

import { AgentBuilder, CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import {
  orkeonAnchorIndex, orkeonCodeIndex, orkeonConfigStore, orkeonFiles, orkeonMemoryToolPorts, orkeonSessionIo, orkeonSharedMemory,
  orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { memoryReadTools, memoryRecallOn, memoryRecallTools } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { devToolCallbacks } from "../../shared/infrastructure/orkeon/tool-callbacks.ts";
import { childAgentBody, openChildAct } from "../../shared/infrastructure/orkeon/child-agents.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { instanceLimits } from "../../shared/domain/agents/instances.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { REVIEWER_CHARTER } from "../../shared/domain/dev/reviewer-charter.ts";
import { runDevPlan } from "./application/run-dev-plan.ts";
import { STEP_BUDGETS } from "../../shared/domain/dev/step-budget.ts";
import { stepPrecedents } from "../../shared/application/dev/step-precedents.ts";

const ports = {
  shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore(), index: orkeonCodeIndex(), anchors: orkeonAnchorIndex(),
};
// memory_recall is attached unless a session rule denies every call of it (the command says so).
const memoryOn = memoryRecallOn(inputs());
const session = orkeonSessionIo();
const effort = providerEffort(inputs().effort);
const limits = instanceLimits(inputs());
// The host's gate first, then these callbacks: the step's rule sets again and the /hooks the command passed.
// memory_recall (the shared memory's precedents) declares `read`: named in readTools, as run_validation in dev-verify.
const callbacksFor = (ctx: any) => devToolCallbacks(
  { step: "dev-plan", hooks: inputs().hooks, readTools: memoryReadTools(memoryOn) }, { shell: ports.shell, log: ctx.log },
);

/** The reviewer, added to the crew by its first act (a sequential crew would run an agent it holds from the start). */
const reviewer = () => {
  const builder = AgentBuilder()
    .name(REVIEWER_CHARTER.name)
    .role(REVIEWER_CHARTER.role)
    .goal(REVIEWER_CHARTER.goal)
    .tools(charterCatalogue(REVIEWER_CHARTER))
    .withAutonomousTools(memoryRecallTools(ToolBuilder, orkeonMemoryToolPorts, memoryOn))
    .maxIterations(REVIEWER_CHARTER.maxIterations)
    .body(childAgentBody(callbacksFor));
  return effort === undefined ? builder : builder.effort(effort);
};

const planner = AgentBuilder()
  .name("dev-planner")
  .role("Technical planner")
  .goal("Turn a settled specification or change brief into batches a test-first implementation can follow")
  // The catalogue is the reviewer's: read tools only, for the inline review on a host without background
  // children. The plan itself is an extract call, which offers none.
  .tools(charterCatalogue(REVIEWER_CHARTER))
  .withAutonomousTools(memoryRecallTools(ToolBuilder, orkeonMemoryToolPorts, memoryOn))
  .maxIterations(REVIEWER_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    const clock = () => new Date();
    const child = openChildAct(
      createLlm(ctx.llm, callbacksFor(ctx), { effort }), ctx, crew, { state: session, clock, log: ctx.log, effort },
      { crew: "dev-plan", step: "dev-plan" },
      { agent: REVIEWER_CHARTER.name, charter: REVIEWER_CHARTER.name, task: "review of the plan", builder: reviewer },
    );
    try {
      // T2: the shared memory's precedents in the planner's prompt, unless memory_recall is denied.
      const precedents = stepPrecedents({ ...ports, memory: orkeonSharedMemory(), log: ctx.log }, { on: memoryOn });
      return await runDevPlan(inputs(), { ...ports, llm: child.llm, log: ctx.log, clock, precedents });
    } finally {
      await child.close();
    }
  })
  .build();

const crew = CrewBuilder()
  .name("dev-plan")
  .process("sequential")
  .budget(STEP_BUDGETS["dev-plan"])
  .concurrency(limits.concurrency)
  .maxInstances(limits.maxInstances)
  .withAgent(planner)
  .build();

publishCrew(crew);

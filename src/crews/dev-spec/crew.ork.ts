// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevSpec crew (/dev-spec). Composition root: it builds one agent from the reviewer's charter (read tools only)
// and wires application/run-dev-spec, which inventories the code by the index, asks the model for the business
// spec as JSON (once more on a refused answer), writes <work>/<code>/SPEC-<code>.md, asks its open questions one at
// a time through human_input (each answer written before the next question), folds the answers into the body, then
// has the read-only reviewer question the spec once. Unattended, the questions stay in the file: BLOCKED.
// The reviewer's act runs in a background child, `dev-reviewer` (its charter: read tools only, plan mode), which
// /tasks lists and stops while it runs, as /dev-plan's (A-3, approach A2); on a host without background children
// it runs inline.
//
// Input (globalThis.inputs): { code: string, request?: string (the brief, a path to it, or a revision request),
//                              hooks?: the /hooks registry, effort?: "low" | "medium" | "high" | null,
//                              memoryRecall?: false (a session rule denies it: the agent gets none),
//                              concurrency?: number, maxInstances?: number }
// Run standalone:  orkeon run src/crews/dev-spec/crew.ork.ts --inputs '{"code":"prune","request":"…"}'
//
// Budget (STEP_BUDGETS["dev-spec"]): about 50 index calls for the inventory, about 20 file and git calls, at most
// seven extract calls (draft, folds, re-asks) and one review of 20 iterations (about 3 tool calls each): well under
// 200 tool calls. The reviewer runs as a child (delegationDepth 1): the runtime gives it what the parent has left
// at its spawn, so its 60 calls are an estimate, not a cap. The wall time counts the person's answers: one hour.

import { AgentBuilder, CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import {
  orkeonClock, orkeonCodeIndex, orkeonConfigStore, orkeonFiles, orkeonHumanInput, orkeonMemoryToolPorts, orkeonSessionIo, orkeonSharedMemory, orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { memoryReadTools, memoryRecallOn, memoryRecallTools } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { memoryDirOf } from "../../shared/application/shared-memory/memory-settings.ts";
import { devToolCallbacks } from "../../shared/application/dev/tool-callbacks.ts";
import { childAgentBody, openChildAct } from "../../shared/infrastructure/orkeon/child-agents.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { instanceLimits } from "../../shared/domain/agents/instances.ts";
import { REVIEWER_CHARTER } from "../../shared/domain/dev/reviewer-charter.ts";
import { STEP_BUDGETS } from "../../shared/domain/dev/step-budget.ts";
import { stepPrecedents } from "../../shared/application/dev/step-precedents.ts";
import { runDevSpec } from "./application/run-dev-spec.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore(), index: orkeonCodeIndex(), human: orkeonHumanInput() };
// memory_recall is attached unless a session rule denies every call of it (the command says so).
const memoryOn = memoryRecallOn(inputs());
const effort = providerEffort(inputs().effort);
const session = orkeonSessionIo();
const limits = instanceLimits(inputs());
// The host's gate first, then these callbacks: the step's rule sets again and the /hooks the command passed.
const callbacksFor = (ctx: any) => devToolCallbacks(
  { step: "dev-spec", hooks: inputs().hooks, readTools: memoryReadTools(memoryOn) }, { shell: ports.shell, log: ctx.log, memoryDir: memoryDirOf(ports.config) },
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

const builder = AgentBuilder()
  .name("dev-spec-writer")
  .role("Business analyst")
  .goal("Write what a feature does and the rules it follows, in business words, and settle its open questions with the person")
  // The catalogue is the reviewer's: read tools only. The spec itself is an extract call, which offers none.
  .tools(charterCatalogue(REVIEWER_CHARTER))
  .withAutonomousTools(memoryRecallTools(ToolBuilder, orkeonMemoryToolPorts, memoryOn))
  .maxIterations(REVIEWER_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    const clock = orkeonClock();
    const child = openChildAct(
      createLlm(ctx.llm, callbacksFor(ctx), { effort }), ctx, crew, { state: session, clock, log: ctx.log, effort },
      { crew: "dev-spec", step: "dev-spec" },
      { agent: REVIEWER_CHARTER.name, charter: REVIEWER_CHARTER.name, task: "review of the spec", builder: reviewer },
    );
    try {
      // T1: the shared memory's precedents in the draft's prompt, unless memory_recall is denied.
      const precedents = stepPrecedents({ ...ports, memory: orkeonSharedMemory(), log: ctx.log }, { on: memoryOn });
      return await runDevSpec(inputs(), { ...ports, llm: child.llm, log: ctx.log, clock, precedents });
    } finally {
      await child.close();
    }
  });
const writer = (effort === undefined ? builder : builder.effort(effort)).build();

const crew = CrewBuilder()
  .name("dev-spec")
  .process("sequential")
  .budget(STEP_BUDGETS["dev-spec"])
  .concurrency(limits.concurrency)
  .maxInstances(limits.maxInstances)
  .withAgent(writer)
  .build();

publishCrew(crew);

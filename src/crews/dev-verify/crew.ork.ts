// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevVerify crew (/dev-verify). Composition root: it builds the auditor agent from its
// charter and wires application/run-dev-verify, which checks the batch's gate, writes
// the capture under <work>/<code>/capture-F<n>/, measures the access cost over the code index
// (index_status, incremental_reindex, access_cost), runs the whole suite under full, asks
// the read-only auditor (its read tools and run_validation, plan mode) - its brief carries the shared memory's
// mistake precedents (T4) - and writes <CODE>-VERIFY-F<n>.md; after a GAPS verdict, the mistakes that recur in three
// batches become candidates under memory.dir and /dev-learn is nudged at two (M-7).
// A red gate or --gate-only returns the gate lines without any model call. The auditor's act runs in a
// background child, `dev-auditor`, which /tasks lists and stops while it runs (A-3,
// shared/application/agents/child-agent.ts); on a host without background children it runs inline.
//
// Input (globalThis.inputs): { batch: "F<n>", plan?: string | null, mode?: "fast" | "full" | "resume", gateOnly?: boolean,
//                              hooks?: the /hooks registry, effort?: "low" | "medium" | "high" | null,
//                              concurrency?: number, maxInstances?: number, memoryRecall?: false (a session rule denies it) }
// Run standalone:  bash scripts/run-crew.sh src/crews/dev-verify/crew.ork.ts --inputs '{"batch":"F1","gateOnly":true}'
//
// Budget: under full, the build (900 s), the whole suite (900 s) and three validations
// (300 s each) can all run, plus the model's own time: one hour of wall time.

import { AgentBuilder, CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import { runValidationTool, scriptToolSlot } from "../../shared/infrastructure/orkeon/script-tools.ts";
import type { ValidationCalls } from "../../shared/infrastructure/orkeon/script-tools.ts";
import { STEP_BUDGETS } from "../../shared/domain/dev/step-budget.ts";
import { orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";
import { memoryRecallOn, memoryRecallTools } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { agentTools, verifyCallbacks, verifyDeps } from "../../shared/infrastructure/orkeon/dev-deps.ts";
import { childAgentBody, withChildAct } from "../../shared/infrastructure/orkeon/child-agents.ts";
import { createChildBoard } from "../../shared/application/agents/child-agent.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { instanceLimits } from "../../shared/domain/agents/instances.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { AUDITOR_CHARTER } from "./domain/auditor-charter.ts";
import { runDevVerify } from "./application/run-dev-verify.ts";

// memory_recall is attached unless a session rule denies every call of it (the command says so).
const memoryOn = memoryRecallOn(inputs());
const effort = providerEffort(inputs().effort);
const limits = instanceLimits(inputs());
// The auditor's run_validation: built here, bound by the body to the run's recording runner (audit.ts) and
// released when the audit ends; two runs bound at once make it refuse (script-tool-slot.ts).
const validationSlot = scriptToolSlot<ValidationCalls>();
// memory_recall's ports: over the tools of the verifier's body (dev-deps.ts), never the global's.
const bodyTools = agentTools();
// The host's gate first, then these callbacks: the step's rule sets again and the /hooks the command passed,
// over the tools of the body that acts (the verifier's, or the background auditor's own).
const options = { hooks: inputs().hooks, effort, memoryOn };
const callbacksFor = (ctx: any) => verifyCallbacks(ctx, options);

/** The auditor as a child, added to the crew by its first act (a sequential crew would run an agent it holds from the start). */
const auditorChild = () => {
  const builder = AgentBuilder()
    .name(AUDITOR_CHARTER.name)
    .role(AUDITOR_CHARTER.role)
    .goal(AUDITOR_CHARTER.goal)
    .tools(charterCatalogue(AUDITOR_CHARTER))
    .withAutonomousTool(runValidationTool(ToolBuilder, validationSlot))
    .withAutonomousTools(memoryRecallTools(ToolBuilder, bodyTools.memoryPorts(), memoryOn))
    .maxIterations(AUDITOR_CHARTER.maxIterations)
    .body(childAgentBody(callbacksFor));
  return effort === undefined ? builder : builder.effort(effort);
};

const verifier = AgentBuilder()
  .name("dev-verifier")
  .role(AUDITOR_CHARTER.role)
  .goal(AUDITOR_CHARTER.goal)
  // The auditor's tools, for the inline audit on a host without background children.
  .tools(charterCatalogue(AUDITOR_CHARTER))
  .withAutonomousTool(runValidationTool(ToolBuilder, validationSlot))
  .withAutonomousTools(memoryRecallTools(ToolBuilder, bodyTools.memoryPorts(), memoryOn))
  .maxIterations(AUDITOR_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    bodyTools.bind(ctx.tools);
    const clock = () => new Date();
    const board = createChildBoard({ state: orkeonSessionIo(ctx.tools), clock, log: ctx.log }, { crew: "dev-verify", step: "dev-verify" });
    try {
      // The ports over this body's tools (dev-deps.ts); the audit's act in a background child, /tasks listing it;
      // T4's precedents in its brief, and after a GAPS verdict the mistakes that recur become candidates (M-7).
      const deps = verifyDeps(ctx, {
        ...options, validationSlot, harvest: true,
        wrapLlm: (llm) => withChildAct(llm, ctx, crew, { board, clock, log: ctx.log, effort },
          { agent: AUDITOR_CHARTER.name, charter: AUDITOR_CHARTER.name, task: `audit of ${String(inputs().batch ?? "the batch")}`, builder: auditorChild }),
      });
      return await runDevVerify(inputs(), deps);
    } finally {
      await board.close();
    }
  })
  .build();

const crew = CrewBuilder()
  .name("dev-verify")
  .process("sequential")
  .budget(STEP_BUDGETS["dev-verify"])
  .concurrency(limits.concurrency)
  .maxInstances(limits.maxInstances)
  .withAgent(verifier)
  .build();

publishCrew(crew);

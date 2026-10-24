// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevVerify crew (/dev-verify). Composition root: it builds the auditor agent from its
// charter and wires application/run-dev-verify, which checks the batch's gate, writes
// the capture under <work>/<code>/capture-F<n>/, measures the access cost over the code index
// (index_status, incremental_reindex, access_cost), runs the whole suite under full, asks
// the read-only auditor (its read tools and run_validation, plan mode) and writes <CODE>-VERIFY-F<n>.md.
// A red gate or --gate-only returns the gate lines without any model call. The auditor's act runs in a
// background child, `dev-auditor`, which /tasks lists and stops while it runs (A-3,
// shared/application/agents/child-agent.ts); on a host without background children it runs inline.
//
// Input (globalThis.inputs): { batch: "F<n>", plan?: string | null, mode?: "fast" | "full" | "resume", gateOnly?: boolean,
//                              hooks?: the /hooks registry, effort?: "low" | "medium" | "high" | null,
//                              concurrency?: number, maxInstances?: number }
// Run standalone:  bash scripts/run-crew.sh src/crews/dev-verify/crew.ork.ts --inputs '{"batch":"F1","gateOnly":true}'
//
// Budget: under full, the build (900 s), the whole suite (900 s) and three validations
// (300 s each) can all run, plus the model's own time: one hour of wall time.

import { AgentBuilder, CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import { RUN_VALIDATION, runValidationTool, scriptToolSlot } from "../../shared/infrastructure/orkeon/script-tools.ts";
import type { ValidationCalls } from "../../shared/infrastructure/orkeon/script-tools.ts";
import { STEP_BUDGETS } from "../../shared/domain/dev/step-budget.ts";
import {
  orkeonConfigStore, orkeonCostIndex, orkeonFiles, orkeonMemoryToolPorts, orkeonSessionIo, orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { MEMORY_RECALL, memoryRecallTool } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { devToolCallbacks } from "../../shared/infrastructure/orkeon/tool-callbacks.ts";
import { childAgentBody, withChildAct } from "../../shared/infrastructure/orkeon/child-agents.ts";
import { createChildBoard } from "../../shared/application/agents/child-agent.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { instanceLimits } from "../../shared/domain/agents/instances.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { AUDITOR_CHARTER } from "./domain/auditor-charter.ts";
import { runDevVerify } from "./application/run-dev-verify.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore(), costIndex: orkeonCostIndex() };
const session = orkeonSessionIo();
const effort = providerEffort(inputs().effort);
const limits = instanceLimits(inputs());
// The auditor's run_validation: built here, bound by the body to the run's recording runner (audit.ts) and
// released when the audit ends; two runs bound at once make it refuse (script-tool-slot.ts).
const validationSlot = scriptToolSlot<ValidationCalls>();
// The host's gate first, then these callbacks: the step's rule sets again and the /hooks the command passed.
// run_validation and memory_recall declare `read`: named in readTools, the callback lets it through when the host has no gate.
const callbacksFor = (ctx: any) => devToolCallbacks(
  { step: "dev-verify", hooks: inputs().hooks, readTools: [RUN_VALIDATION.name, MEMORY_RECALL.name] }, { shell: ports.shell, log: ctx.log },
);

/** The auditor as a child, added to the crew by its first act (a sequential crew would run an agent it holds from the start). */
const auditorChild = () => {
  const builder = AgentBuilder()
    .name(AUDITOR_CHARTER.name)
    .role(AUDITOR_CHARTER.role)
    .goal(AUDITOR_CHARTER.goal)
    .tools(charterCatalogue(AUDITOR_CHARTER))
    .withAutonomousTool(runValidationTool(ToolBuilder, validationSlot))
    .withAutonomousTool(memoryRecallTool(ToolBuilder, orkeonMemoryToolPorts))
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
  .withAutonomousTool(memoryRecallTool(ToolBuilder, orkeonMemoryToolPorts))
  .maxIterations(AUDITOR_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    const clock = () => new Date();
    const board = createChildBoard({ state: session, clock, log: ctx.log }, { crew: "dev-verify", step: "dev-verify" });
    const llm = withChildAct(
      createLlm(ctx.llm, callbacksFor(ctx), { effort }), ctx, crew, { board, clock, log: ctx.log, effort },
      { agent: AUDITOR_CHARTER.name, charter: AUDITOR_CHARTER.name, task: `audit of ${String(inputs().batch ?? "the batch")}`, builder: auditorChild },
    );
    try {
      return await runDevVerify(inputs(), { ...ports, llm, log: ctx.log, clock, validationSlot });
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

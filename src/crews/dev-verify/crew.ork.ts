// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevVerify crew (/dev-verify). Composition root: it builds the auditor agent from its
// charter and wires application/run-dev-verify, which checks the batch's gate, writes
// the capture under <work>/<code>/capture-F<n>/, measures the access cost over the code index
// (index_status, incremental_reindex, access_cost), runs the whole suite under full, asks
// the read-only auditor (four read tools, plan mode) and writes <CODE>-VERIFY-F<n>.md.
// A red gate or --gate-only returns the gate lines without any model call.
//
// Input (globalThis.inputs): { batch: "F<n>", plan?: string | null, mode?: "fast" | "full" | "resume", gateOnly?: boolean,
//                              hooks?: the /hooks registry }
// Run standalone:  bash scripts/run-crew.sh src/crews/dev-verify/crew.ork.ts --inputs '{"batch":"F1","gateOnly":true}'
//
// Budget: under full, the build (900 s), the whole suite (900 s) and three validations
// (300 s each) can all run, plus the model's own time: one hour of wall time.

import { AgentBuilder, CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import { RUN_VALIDATION, runValidationTool, scriptToolSlot } from "../../shared/infrastructure/orkeon/script-tools.ts";
import type { ValidationCalls } from "../../shared/infrastructure/orkeon/script-tools.ts";
import { STEP_BUDGETS } from "../../shared/domain/dev/step-budget.ts";
import { orkeonConfigStore, orkeonCostIndex, orkeonFiles, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { devToolCallbacks } from "../../shared/infrastructure/orkeon/tool-callbacks.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { AUDITOR_CHARTER } from "./domain/auditor-charter.ts";
import { runDevVerify } from "./application/run-dev-verify.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore(), costIndex: orkeonCostIndex() };
// The auditor's run_validation: built here, bound by the body to the run's recording runner (audit.ts) and
// released when the audit ends; two runs bound at once make it refuse (script-tool-slot.ts).
const validationSlot = scriptToolSlot<ValidationCalls>();

const auditor = AgentBuilder()
  .name(AUDITOR_CHARTER.name)
  .role(AUDITOR_CHARTER.role)
  .goal(AUDITOR_CHARTER.goal)
  .tools(charterCatalogue(AUDITOR_CHARTER))
  .withAutonomousTool(runValidationTool(ToolBuilder, validationSlot))
  .maxIterations(AUDITOR_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    // The host's gate first, then this callback: the step's rule sets again and the /hooks the command passed.
    // run_validation declares `read`: named in readTools, the callback lets it through when the host has no gate.
    const callbacks = devToolCallbacks(
      { step: "dev-verify", hooks: inputs().hooks, readTools: [RUN_VALIDATION.name] }, { shell: ports.shell, log: ctx.log },
    );
    return await runDevVerify(inputs(), {
      ...ports, llm: createLlm(ctx.llm, callbacks), log: ctx.log, clock: () => new Date(), validationSlot,
    });
  })
  .build();

publishCrew(
  CrewBuilder()
    .name("dev-verify")
    .process("sequential")
    .budget(STEP_BUDGETS["dev-verify"])
    .withAgent(auditor)
    .build(),
);

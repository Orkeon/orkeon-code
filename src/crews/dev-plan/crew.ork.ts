// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevPlan crew (/dev-plan). Composition root: it builds one agent from the reviewer's charter (read tools only,
// plan mode) and wires application/run-dev-plan, which stops on a Blocking open question, inventories the code
// by the index, asks the model for the plan as JSON (once more on a refused answer), writes <CODE>-PLAN.md, one
// sheet per batch and plan.json, then has the read-only reviewer question the plan once.
//
// Input (globalThis.inputs): { source: string | null, replace?: boolean, hooks?: the /hooks registry }
// Run standalone:  bash scripts/run-crew.sh src/crews/dev-plan/crew.ork.ts --inputs '{"source":"prune"}'
//
// Budget: up to 59 index and batch_anchors calls by code, at most 40 folder listings for the anchors (one per folder for the run,
// both attempts sharing them), about 30 other file and git calls, two extract calls and one review of 20
// iterations (about 3 tool calls each): 59 + 40 + 30 + 2 + 60 = 191, so toolCalls 240 leaves a margin that 200
// did not.

import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonAnchorIndex, orkeonCodeIndex, orkeonConfigStore, orkeonFiles, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { devToolCallbacks } from "../../shared/infrastructure/orkeon/tool-callbacks.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { REVIEWER_CHARTER } from "../../shared/domain/dev/reviewer-charter.ts";
import { runDevPlan } from "./application/run-dev-plan.ts";
import { STEP_BUDGETS } from "../../shared/domain/dev/step-budget.ts";

const ports = {
  shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore(), index: orkeonCodeIndex(), anchors: orkeonAnchorIndex(),
};

const planner = AgentBuilder()
  .name("dev-planner")
  .role("Technical planner")
  .goal("Turn a settled specification or change brief into batches a test-first implementation can follow")
  // The catalogue is the reviewer's: read tools only. The plan itself is an extract call, which offers none.
  .tools(charterCatalogue(REVIEWER_CHARTER))
  .maxIterations(REVIEWER_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    // The host's gate first, then this callback: the step's rule sets again and the /hooks the command passed.
    const callbacks = devToolCallbacks({ step: "dev-plan", hooks: inputs().hooks }, { shell: ports.shell, log: ctx.log });
    return await runDevPlan(inputs(), { ...ports, llm: createLlm(ctx.llm, callbacks), log: ctx.log, clock: () => new Date() });
  })
  .build();

publishCrew(
  CrewBuilder()
    .name("dev-plan")
    .process("sequential")
    .budget(STEP_BUDGETS["dev-plan"])
    .withAgent(planner)
    .build(),
);

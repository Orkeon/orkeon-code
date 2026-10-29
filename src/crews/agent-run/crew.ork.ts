// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// AgentRun crew (/tasks send and repair on an ended run, A-3). Composition root of
// application/run-agent-run: one agent built at load from the built-in charter its inputs name
// (dev-reviewer, dev-auditor), its catalogue the charter's (the auditor's run_validation belongs to a
// dev-verify run and is not offered here), its effort the one /effort stored; the body acts once on
// the brief in the charter's mode, under the callbacks of the instance's step, and returns the reply.
//
// Input (globalThis.inputs): { charter: "dev-reviewer" | "dev-auditor", system?: string, brief: string,
//                              effort?: "low" | "medium" | "high" | "xhigh" | "max" | null, hooks?: the /hooks registry,
//                              memoryRecall?: false (a session rule denies it), step?: the instance's run step }
//        (the step: the instance's run's - dev-plan, dev-verify, dev-spec, dev-change -, else the charter's)
// Budget: repairBudget(step), the step's own, so that a repaired audit or review stops where the original would.
// Run standalone:  bash scripts/run-crew.sh src/crews/agent-run/crew.ork.ts --inputs '{"charter":"dev-reviewer","brief":"…"}'

import { CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import {
  orkeonAgent,
  orkeonConfigStore,
  orkeonMemoryToolPorts,
  orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { memoryReadTools, memoryRecallOn, memoryRecallTools } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { devToolCallbacks } from "../../shared/application/dev/tool-callbacks.ts";
import { memoryDirOf } from "../../shared/application/shared-memory/memory-settings.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import type { Charter } from "../../shared/domain/agents/charter.ts";
import { repairStep } from "../../shared/domain/agents/built-in-charters.ts";
import { repairBudget } from "../../shared/domain/dev/step-budget.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { REVIEWER_CHARTER } from "../../shared/domain/dev/reviewer-charter.ts";
import { AUDITOR_CHARTER } from "../dev-verify/domain/auditor-charter.ts";
import { runAgentRun } from "./application/run-agent-run.ts";

const CHARTERS: Readonly<Record<string, Charter>> = { [REVIEWER_CHARTER.name]: REVIEWER_CHARTER, [AUDITOR_CHARTER.name]: AUDITOR_CHARTER };
const shell = orkeonShell();
// memory_recall is attached unless a session rule denies every call of it (the command says so).
const memoryOn = memoryRecallOn(inputs());
const effort = providerEffort(inputs().effort);
// The agent's tools are fixed at build: the named charter's, the reviewer's when the name is unknown
// (the body refuses it before any model call).
const charter = CHARTERS[String(inputs().charter ?? "")] ?? REVIEWER_CHARTER;
const step = repairStep(charter.name, inputs().step);

const builder = orkeonAgent()
  .name("agent-run")
  .role(charter.role)
  .goal(charter.goal)
  .tools(charterCatalogue(charter))
  .withAutonomousTools(memoryRecallTools(ToolBuilder, orkeonMemoryToolPorts, memoryOn))
  .maxIterations(charter.maxIterations)
  .body(async (_input: any, ctx: any) => {
    // The host's gate first, then the callbacks of the charter's step: its rule sets and the /hooks /tasks passed.
    const callbacks = devToolCallbacks({ step, hooks: inputs().hooks, readTools: memoryReadTools(memoryOn) }, { shell, log: ctx.log, memoryDir: memoryDirOf(orkeonConfigStore()) });
    return await runAgentRun(inputs(), { llm: createLlm(ctx.llm, callbacks, { effort }), log: ctx.log, charters: CHARTERS });
  });

publishCrew(
  CrewBuilder()
    .name("agent-run")
    .process("sequential")
    .budget(repairBudget(step))
    .withAgent((effort === undefined ? builder : builder.effort(effort)).build())
    .build(),
);

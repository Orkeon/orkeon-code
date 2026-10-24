// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevChange crew (/dev-change). Composition root: it builds one agent from the reviewer's charter (read tools only)
// and wires application/run-dev-change, which reads the origin whole (an issue by gh, a file, the text), runs the
// reproduction of a bug or the measurement of a perf change before anything else (a bug that does not fail stops),
// inventories the code by the index, asks the model for the brief as JSON, writes <work>/<code>/CHANGE-<code>.md,
// asks its open questions one at a time through human_input (each answer written before the next question), folds
// the answers in, then has the read-only reviewer question the brief once. Unattended: BLOCKED, questions in the file.
//
// Input (globalThis.inputs): { code: string, kind?: "bug" | "refactor" | "perf", run?: string (the command to run),
//                              text?: string (the origin of a new brief, or a revision request), hooks?: /hooks,
//                              effort?: "low" | "medium" | "high" | null, memoryRecall?: false (a session rule denies it) }
// Run standalone:  orkeon run src/crews/dev-change/crew.ork.ts --inputs '{"code":"cache","kind":"refactor","text":"…"}'
//
// Budget (STEP_BUDGETS["dev-change"]): one gh call, one run of at most 600 s, about 50 index calls, about 20 file
// and git calls, at most nine extract calls and one review of 20 iterations: well under 200 tool calls. The wall
// time counts the run and the person's answers: one hour.

import { AgentBuilder, CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import {
  orkeonCodeIndex, orkeonConfigStore, orkeonFiles, orkeonHumanInput, orkeonMemoryToolPorts, orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { memoryReadTools, memoryRecallOn, memoryRecallTools } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { devToolCallbacks } from "../../shared/infrastructure/orkeon/tool-callbacks.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { REVIEWER_CHARTER } from "../../shared/domain/dev/reviewer-charter.ts";
import { STEP_BUDGETS } from "../../shared/domain/dev/step-budget.ts";
import { runDevChange } from "./application/run-dev-change.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore(), index: orkeonCodeIndex(), human: orkeonHumanInput() };
// memory_recall is attached unless a session rule denies every call of it (the command says so).
const memoryOn = memoryRecallOn(inputs());
const effort = providerEffort(inputs().effort);

const builder = AgentBuilder()
  .name("dev-change-writer")
  .role("Change analyst")
  .goal("Write what is wrong or costly in code that exists, the evidence that shows it and what must survive, and settle its open questions with the person")
  // The catalogue is the reviewer's: read tools only. The brief itself is an extract call, which offers none.
  .tools(charterCatalogue(REVIEWER_CHARTER))
  .withAutonomousTools(memoryRecallTools(ToolBuilder, orkeonMemoryToolPorts, memoryOn))
  .maxIterations(REVIEWER_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    // The host's gate first, then this callback: the step's rule sets again and the /hooks the command passed.
    const callbacks = devToolCallbacks({ step: "dev-change", hooks: inputs().hooks, readTools: memoryReadTools(memoryOn) }, { shell: ports.shell, log: ctx.log });
    return await runDevChange(inputs(), { ...ports, llm: createLlm(ctx.llm, callbacks, { effort }), log: ctx.log, clock: () => new Date() });
  });
const writer = (effort === undefined ? builder : builder.effort(effort)).build();

publishCrew(
  CrewBuilder()
    .name("dev-change")
    .process("sequential")
    .budget(STEP_BUDGETS["dev-change"])
    .withAgent(writer)
    .build(),
);

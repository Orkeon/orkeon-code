// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevChange crew (/dev-spec with a kind; its alias /dev-change). Composition root: it builds one agent from the
// reviewer's charter (read tools only) and wires application/run-dev-change, which reads the origin whole (an issue
// by gh, a file, the text), runs the reproduction of a bug or the measurement of a perf change before anything else (a bug that does not fail stops),
// inventories the code by the index, asks the model for the brief as JSON, writes <work>/<code>/CHANGE-<code>.md,
// asks its open questions one at a time through human_input (each answer written before the next question), folds
// the answers in, then has the read-only reviewer question the brief once. Unattended: BLOCKED, questions in the file.
// A new brief the model routes as a feature goes on as a spec in the same run (runDevSpec, over the same ports).
// The reviewer's act runs in a background child, `dev-reviewer` (its charter: read tools only, plan mode), which
// /tasks lists and stops while it runs, as /dev-plan's (A-3, approach A2); on a host without background children
// it runs inline.
//
// Input (globalThis.inputs): { code: string, kind?: "bug" | "refactor" | "perf", run?: string (the command to run),
//                              text?: string (the origin of a new brief, or a revision request), hooks?: /hooks,
//                              effort?: "low" | "medium" | "high" | null, memoryRecall?: false (a session rule denies it),
//                              concurrency?: number, maxInstances?: number }
// Run standalone:  orkeon run src/crews/dev-change/crew.ork.ts --inputs '{"code":"cache","kind":"refactor","text":"…"}'
//
// Budget (STEP_BUDGETS["dev-change"]): one gh call, one run of at most 600 s, about 50 index calls, about 20 file
// and git calls, at most nine extract calls and one review of 20 iterations: well under 200 tool calls. The
// reviewer runs as a child (delegationDepth 1): the runtime gives it what the parent has left at its spawn, so its
// 60 calls are an estimate, not a cap. The wall time counts the run and the person's answers: one hour. A feature
// routed at the first draft goes on as a spec within the same budget: by then the change spent its inventory and one
// extract call, at most one run.

import { CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import {
  orkeonAgent,
  orkeonClock,
  orkeonCodeIndex,
  orkeonConfigStore,
  orkeonFiles,
  orkeonHumanInput,
  orkeonMemoryToolPorts,
  orkeonSessionIo,
  orkeonSharedMemory,
  orkeonShell,
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
import { runDevChange } from "./application/run-dev-change.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore(), index: orkeonCodeIndex(), human: orkeonHumanInput() };
// memory_recall is attached unless a session rule denies every call of it (the command says so).
const memoryOn = memoryRecallOn(inputs());
const effort = providerEffort(inputs().effort);
const session = orkeonSessionIo();
const limits = instanceLimits(inputs());
// The host's gate first, then these callbacks: the step's rule sets again and the /hooks the command passed.
const callbacksFor = (ctx: any) => devToolCallbacks(
  { step: "dev-change", hooks: inputs().hooks, readTools: memoryReadTools(memoryOn) }, { shell: ports.shell, log: ctx.log, memoryDir: memoryDirOf(ports.config) },
);

/** The reviewer, added to the crew by its first act (a sequential crew would run an agent it holds from the start). */
const reviewer = () => {
  const builder = orkeonAgent()
    .name(REVIEWER_CHARTER.name)
    .role(REVIEWER_CHARTER.role)
    .goal(REVIEWER_CHARTER.goal)
    .tools(charterCatalogue(REVIEWER_CHARTER))
    .withAutonomousTools(memoryRecallTools(ToolBuilder, orkeonMemoryToolPorts, memoryOn))
    .maxIterations(REVIEWER_CHARTER.maxIterations)
    .body(childAgentBody(callbacksFor));
  return effort === undefined ? builder : builder.effort(effort);
};

const builder = orkeonAgent()
  .name("dev-change-writer")
  .role("Change analyst")
  .goal("Write what is wrong or costly in code that exists, the evidence that shows it and what must survive, and settle its open questions with the person")
  // The catalogue is the reviewer's: read tools only. The brief itself is an extract call, which offers none.
  .tools(charterCatalogue(REVIEWER_CHARTER))
  .withAutonomousTools(memoryRecallTools(ToolBuilder, orkeonMemoryToolPorts, memoryOn))
  .maxIterations(REVIEWER_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    const clock = orkeonClock();
    const child = openChildAct(
      createLlm(ctx.llm, callbacksFor(ctx), { effort }), ctx, crew, { state: session, clock, log: ctx.log, effort },
      { crew: "dev-change", step: "dev-change" },
      { agent: REVIEWER_CHARTER.name, charter: REVIEWER_CHARTER.name, task: "review of the brief", builder: reviewer },
    );
    try {
      // T1: the shared memory's precedents in the draft's prompt, unless memory_recall is denied.
      const precedents = stepPrecedents({ ...ports, memory: orkeonSharedMemory(), log: ctx.log }, { on: memoryOn });
      return await runDevChange(inputs(), { ...ports, llm: child.llm, log: ctx.log, clock, precedents });
    } finally {
      await child.close();
    }
  });
const writer = (effort === undefined ? builder : builder.effort(effort)).build();

const crew = CrewBuilder()
  .name("dev-change")
  .process("sequential")
  .budget(STEP_BUDGETS["dev-change"])
  .concurrency(limits.concurrency)
  .maxInstances(limits.maxInstances)
  .withAgent(writer)
  .build();

publishCrew(crew);

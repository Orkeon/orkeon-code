// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevVerify crew (/dev-verify). Composition root: it builds the auditor agent from its
// charter and wires application/run-dev-verify, which checks the batch's gate, writes
// the capture under <work>/<code>/capture-F<n>/, runs the whole suite under full, asks
// the read-only auditor (four read tools, plan mode) and writes <CODE>-VERIFY-F<n>.md.
// A red gate or --gate-only returns the gate lines without any model call.
//
// Input (globalThis.inputs): { batch: "F<n>", plan?: string | null, mode?: "fast" | "full" | "resume", gateOnly?: boolean }
// Run standalone:  bash scripts/run-crew.sh src/crews/dev-verify/crew.ork.ts --inputs '{"batch":"F1","gateOnly":true}'
//
// Budget: under full, the build (900 s), the whole suite (900 s) and three validations
// (300 s each) can all run, plus the model's own time: one hour of wall time.

import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonConfigStore, orkeonFiles, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { AUDITOR_CHARTER } from "./domain/auditor-charter.ts";
import { runDevVerify } from "./application/run-dev-verify.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore() };

const auditor = AgentBuilder()
  .name(AUDITOR_CHARTER.name)
  .role(AUDITOR_CHARTER.role)
  .goal(AUDITOR_CHARTER.goal)
  .tools(charterCatalogue(AUDITOR_CHARTER))
  .maxIterations(AUDITOR_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) =>
    await runDevVerify(inputs(), { ...ports, llm: createLlm(ctx.llm), log: ctx.log, clock: () => new Date() }))
  .build();

publishCrew(
  CrewBuilder()
    .name("dev-verify")
    .process("sequential")
    .budget({ toolCalls: 200, wallTime: 3600, tokens: 300_000, delegationDepth: 0 })
    .withAgent(auditor)
    .build(),
);

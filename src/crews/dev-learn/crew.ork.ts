// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevLearn crew (/dev-learn). Composition root: it wires application/run-dev-learn,
// which reads every verdict file of the work folder, groups the untreated Blocking and
// Major gaps by axis, and for each axis whose gaps span three batches or more asks the
// model once (once more on a wrong answer) to name the motifs behind them. Code filters
// the motifs, checks their owner file and writes <work>/learn-<date>/PROPOSALS.md and
// proposals.json. With list, it prints the backlog per axis: no model call, no write.
//
// Input (globalThis.inputs): { axis?: string | null, list?: boolean }
// Run standalone:  bash scripts/run-crew.sh src/crews/dev-learn/crew.ork.ts --inputs '{"list":true}'
//
// No budget, as analyze: the calls are code's, and at most six extract calls run
// (three axes, one re-ask each).

import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonConfigStore, orkeonFiles, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runDevLearn } from "./application/run-dev-learn.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore() };

const learner = AgentBuilder()
  .name("dev-learner")
  .role("Recurring-gap analyst")
  // NO tools on purpose: one extract per axis, and every row it judges is in the prompt.
  .tools([])
  .goal("Turn the gaps that audits keep finding into a few preventive lines, each with its owner file.")
  .body(async (_input: any, ctx: any) =>
    await runDevLearn(inputs(), { ...ports, llm: createLlm(ctx.llm), log: ctx.log, clock: () => new Date() }))
  .build();

publishCrew(
  CrewBuilder()
    .name("dev-learn")
    .process("sequential")
    .withAgent(learner)
    .build(),
);

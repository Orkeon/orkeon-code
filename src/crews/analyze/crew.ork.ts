// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// /analyze — deterministic codebase analysis (composition root).
//
// The whole point of this crew is that NO tool choice is left to the model:
// application/run-analyze chains index → maps → dependency_graph → package
// summaries itself, renders the harvest, and then — unless `raw` — makes ONE
// synthesis call whose agent has NO tools.
//
// Triggered by:  /analyze [--raw] [--parallel N]  →  script-host.runCrewAsync("analyze", { raw, parallel })
// Input (globalThis.inputs): { raw?: boolean; parallel?: number }

import { CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonAgent, orkeonCodeIndex, orkeonProgress } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runAnalyze } from "./application/run-analyze.ts";

const ports = { index: orkeonCodeIndex(), progress: orkeonProgress() };

const analyst = orkeonAgent()
  .name("analyst")
  .role("Codebase Analyst")
  // NO tools on purpose: the synthesis act() must be a pure completion. The
  // deterministic phase calls the host tools directly through the CodeIndex
  // adapter, which does not go through the agent catalogue.
  .tools([])
  .goal("Harvest the code index deterministically and synthesize business objects and dependencies.")
  .body(async (_input: any, ctx: any) =>
    await runAnalyze(inputs(), { ...ports, llm: createLlm(ctx.llm), log: ctx.log }))
  .build();

publishCrew(
  CrewBuilder()
    .name("analyze")
    .process("sequential")
    .withAgent(analyst)
    .build(),
);

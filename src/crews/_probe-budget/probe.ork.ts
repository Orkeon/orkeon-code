// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// A9 acceptance probe (FINALIZE-PLAN F1.4) — a divergent act() under
// .budget({ toolCalls: 1 }). Expected since F1: the SECOND tool call is refused
// by the pre-flight gate → BudgetExhaustedException surfaces typed and the run
// FAILS (exit ≠ 0 with "Tool-call budget exhausted"). Pre-F1 behaviour (the bug
// this probe documents): ~7 tool calls then a normal completion.
//
// Run:  bash scripts/run-crew.sh src/crews/_probe-budget/probe.ork.ts

import { AgentBuilder, CrewBuilder, publishCrew } from "../../shared/infrastructure/globals.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";

const prober = AgentBuilder()
  .name("budget-prober")
  .role("Budget Probe")
  .goal("Diverge: keep calling tools until something stops you.")
  .tools(["directory_read", "file_read"])
  .body(async (_input: any, ctx: any) =>
    await createLlm(ctx.llm).act(
      "You are testing a runaway loop. Call the directory_read tool on '/workspace' " +
      "then keep calling tools (directory_read or file_read on any file you saw) " +
      "on every turn. NEVER produce a final answer — always call another tool.",
      { maxIterations: 40, permissionMode: "bypassPermissions" },
    ))
  .build();

publishCrew(
  CrewBuilder()
    .name("probe-budget")
    .process("autonomous")
    .budget({ toolCalls: 1 })
    .withAgent(prober)
    .build(),
);

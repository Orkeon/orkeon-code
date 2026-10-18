// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// Interactive coding-agent loop (main-loop) — exp 07 SPEC §3. Composition root.
// The agent's `.body()` IS the loop: one turn of application/run-main-loop, whose
// act() call runs the LLM ⇄ tool-calling cycle over the agent's tool catalogue,
// under an autonomous execution budget.
//
// Triggered by:  /assistant "<demande>", /summary, /transcribe --then, /voice send|--go
//                →  script-host.runCrewAsync("main-loop", { prompt, permissionMode, ... })
// Input (globalThis.inputs): { prompt: string, permissionMode?: "default"|"acceptEdits"|"bypassPermissions"|"plan"|"dontAsk",
//                              permissionModeVia?: string, permissionRules?: string[], extraTools?: string[],
//                              prelude?: { tool, args, label, as? }, epilogue?: { tool, args, textArg, label } }
// The launching command resolves the mode (the session's when the request names
// none) and the extra tools the host registers: without a mode the turn runs in
// `default`. A prelude is its tool call before the turn (the transcription of
// /transcribe --then, the dictation of /voice --go), an epilogue its call after
// it, with the answer (voice.reply: speak). Both run within the turn's wallTime.
//
// Permissions: the TOOL CATALOGUE is what the mode offers the model
// (shared/domain/agent-policy), the extra tools of the classes it grants
// included, less the tools a deny rule covers whole; `plan` and `dontAsk` offer
// no mutating tool. The host's permission gate checks every call the model
// makes (act) against the session's rules, then the mode, and asks the operator
// when the mode says so ([y] once / [s] session / [n] no).

import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonMemoryStore, orkeonProgress, orkeonSessionIo, orkeonShell, orkeonTelemetry,
  orkeonToolCalls,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { createRunState } from "../../shared/infrastructure/orkeon/run-state.ts";
import { compactSession, readCompactionTrigger } from "../../shared/application/compaction/compact-session.ts";
import { loadCatalogue, runMainLoop } from "./application/run-main-loop.ts";
import { BREAKER_RUN_FIELD } from "./application/auto-compact.ts";

// The tool catalogue is decided at load time (module scope is synchronous), from
// the inputs alone: see loadCatalogue.
const loaded = loadCatalogue(inputs());

const session = orkeonSessionIo();
const progress = orkeonProgress();
const files = orkeonFiles();
const memory = orkeonMemoryStore();
const ports = {
  shell: orkeonShell(), session, files, telemetry: orkeonTelemetry(), memory, tools: orkeonToolCalls(),
  config: orkeonConfigStore(),
};

const coder = AgentBuilder()
  .name("coder")
  .role("Interactive Coding Agent")
  .goal("Understand a coding request, explore/edit/run code via tool-calling under permission, and answer.")
  .tools(loaded.catalogue.tools)
  .maxIterations(40)
  .withState(() => ({ permissionMode: loaded.mode, [BREAKER_RUN_FIELD]: 0 }))
  .body(async (_input: any, ctx: any) => {
    const llm = createLlm(ctx.llm);
    const log = ctx.log;
    return await runMainLoop(inputs(), loaded, {
      ...ports,
      llm,
      log,
      run: createRunState(ctx),
      compact: async () => compactSession(
        { force: false, trigger: await readCompactionTrigger(ports.config) },
        { progress, session, files, memory, llm, log },
      ),
    });
  })
  .build();

// The budget bounds one turn. Its wall time (seconds) is the model's own work: the
// clock stops while a tool call waits for the operator's answer (Orkeon #127; the
// engine's ExecutionTimeout pauses the same way). 30 minutes, the example settings'
// ExecutionTimeout too, bound a long interactive turn.
publishCrew(
  CrewBuilder()
    .name("main-loop")
    .process("autonomous")
    .budget({ toolCalls: 200, wallTime: 1800, tokens: 400_000, delegationDepth: 2 })
    .withAgent(coder)
    .build(),
);

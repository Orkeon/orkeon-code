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
//                              prelude?: { tool, args, label, as? }, epilogue?: { tool, args, textArg, label },
//                              sessionStart?: { script, lines }, closingLine?: string }
// sessionStart is what the session's start script printed (first turn only): the
// turn-start chain stores it as a [turn-context] message before the request. The stop
// chain sends a blank answer back once, and one without a line starting with
// closingLine when the launching command names one (domain/turn-chains).
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
// when the mode says so ([y] once / [s] session / [n] no). The shared memory's
// tools are Orkeon Code's own (memory-tools.ts): memory_recall in every mode,
// memory_push (a candidate file, never an entry) where the mode edits.

import { AgentBuilder, CrewBuilder, publishCrew, inputs, ToolBuilder } from "../../shared/infrastructure/globals.ts";
import {
  orkeonClock, orkeonCompactionDeps, orkeonConfigStore, orkeonFiles, orkeonMemoryStore, orkeonMemoryToolPorts,
  orkeonProgress, orkeonSessionIo, orkeonShell, orkeonTelemetry, orkeonToolCalls,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { memoryTools } from "../../shared/infrastructure/orkeon/memory-tools.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { memoryGuardCallbacks } from "../../shared/application/dev/tool-callbacks.ts";
import { memoryDirOf } from "../../shared/application/shared-memory/memory-settings.ts";
import { createRunState } from "../../shared/infrastructure/orkeon/run-state.ts";
import { compactSession, readCompactionTrigger } from "../../shared/application/compaction/compact-session.ts";
import { loadCatalogue, runMainLoop } from "./application/run-main-loop.ts";
import { BREAKER_RUN_FIELD } from "./application/auto-compact.ts";

// The tool catalogue is decided at load time (module scope is synchronous), from
// the inputs alone: see loadCatalogue.
const loaded = loadCatalogue(inputs());

const clock = orkeonClock();
const progress = orkeonProgress();
const ports = {
  shell: orkeonShell(), session: orkeonSessionIo(), files: orkeonFiles(), telemetry: orkeonTelemetry(),
  memory: orkeonMemoryStore(), tools: orkeonToolCalls(), config: orkeonConfigStore(),
};

const coder = AgentBuilder()
  .name("coder")
  .role("Interactive Coding Agent")
  .goal("Understand a coding request, explore/edit/run code via tool-calling under permission, and answer.")
  .tools(loaded.catalogue.tools)
  // The shared memory's tools the mode offers (memory_recall always, memory_push where it edits), attached, not named.
  .withAutonomousTools(memoryTools(ToolBuilder, orkeonMemoryToolPorts, loaded.mode, loaded.scriptTools))
  .maxIterations(40)
  .withState(() => ({ permissionMode: loaded.mode, [BREAKER_RUN_FIELD]: 0 }))
  .body(async (_input: any, ctx: any) => {
    // The shared memory's guard on every call: what the host's gate cannot read (an edit_batch's operations, a
    // path in another case, a shell cd into the folder) is refused here (shared-memory/layout memoryWriteRefusal).
    const llm = createLlm(ctx.llm, memoryGuardCallbacks(memoryDirOf(ports.config)));
    const log = ctx.log;
    return await runMainLoop(inputs(), loaded, {
      ...ports,
      llm,
      log,
      run: createRunState(ctx),
      clock,
      compact: async () => compactSession(
        { force: false, trigger: await readCompactionTrigger(ports.config) },
        orkeonCompactionDeps({ llm, log }, { ...ports, progress }, clock),
      ),
    });
  })
  .build();

// The budget bounds one turn. Its wall time (seconds) is the model's own work: the
// clock stops while a tool call waits for the operator's answer (Orkeon #127; the
// engine's ExecutionTimeout pauses the same way). 30 minutes, the example settings'
// ExecutionTimeout too, bound a long interactive turn. The tokens are the sum of every
// call's prompt and completion: a turn pays its whole context again at each call, so a
// turn that reads a dozen files grows with the square of its calls (400k ended one of
// 17 reads in 43 s); 1.5M leaves the 40 iterations a context of 37k each on average.
publishCrew(
  CrewBuilder()
    .name("main-loop")
    .process("autonomous")
    .budget({ toolCalls: 200, wallTime: 1800, tokens: 1_500_000, delegationDepth: 2 })
    .withAgent(coder)
    .build(),
);

// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// speech — one call to the speech MCP server (mcp/whisper), made by the crew
// (composition root).
//
// The tool is the one the command names: transcribe_audio or list_audio
// (/transcribe), record_and_transcribe (/voice), speak (/say). The call is the
// command's, not the model's: the agent has NO tools and makes no LLM call;
// application/run-speech calls the host tool directly, as long as it takes (a
// command's handler may wait 10 s at most), and answers its text.
//
// Triggered by:  /transcribe, /voice, /say  →  script-host.runCrewAsync("speech", { tool, args, label })
// Input (globalThis.inputs): { tool: string, args: object, label: string }
import { CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonAgent, orkeonToolCalls } from "../../shared/infrastructure/orkeon/wiring.ts";
import { runSpeech } from "./application/run-speech.ts";

const tools = orkeonToolCalls();

const speaker = orkeonAgent()
  .name("speech")
  .role("Speech")
  // NO tools on purpose: the call below is the command's, made through the tools
  // namespace, not offered to a model.
  .tools([])
  .goal("Make the call to the speech server the command names and return its text.")
  .body(async (_input: any, ctx: any) => await runSpeech(inputs(), { tools, log: ctx.log }))
  .build();

publishCrew(
  CrewBuilder()
    .name("speech")
    .process("sequential")
    .withAgent(speaker)
    .build(),
);

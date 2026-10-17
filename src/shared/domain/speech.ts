// Speech output in the turn: the session key voice.reply and the epilogue it adds.
// On, every answer of the main loop is read aloud by the speech MCP server's speak
// (mcp/whisper), as a call of the command that launched the turn. Pure.
import type { EpilogueCall } from "./prelude.ts";

/** The session key: "on" reads every answer aloud; anything else, or unset, does not. */
export const VOICE_REPLY_CONFIG_KEY = "voice.reply";

/** The speech server's tool that reads a text aloud. */
export const SPEAK_TOOL = "speak";

/** Whether a value of voice.reply turns the reading on. */
export function voiceReplyOn(value: string | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "on";
}

/** The epilogue that reads the answer aloud, with speak under the name the host registers. */
export function voiceReplyEpilogue(registeredSpeak: string): EpilogueCall {
  return { tool: registeredSpeak, args: {}, textArg: "text", label: "Reply read aloud" };
}

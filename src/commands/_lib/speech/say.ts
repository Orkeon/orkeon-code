// /say: read a text aloud through the speech MCP server (mcp/whisper), or the
// assistant's last answer when no text is given. The server cleans the Markdown
// off, synthesizes the text (Piper, OpenAI's API or a compatible server) and
// plays it on the speaker when the launcher ran with ORKEON_CODE_VOICE=1;
// otherwise it writes /transcripts/speech.wav and says it played nothing.
//
// The reading is the command's call, made by the speech crew: synthesizing a
// long answer can outlast the 10 s a handler may wait. --stop is a quick call,
// made here.
import type { ToolCatalogue } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { errorText } from "../../../shared/domain/prelude.ts";
import { SPEAK_TOOL } from "../../../shared/domain/speech.ts";
import { commandLine, isOption, optionValue, splitWords } from "../args.ts";
import { launchCrew } from "../dispatch.ts";
import type { LaunchDeps, LaunchResult } from "../dispatch.ts";
import { missingToolMessage } from "./transcribe.ts";

export const STOP_TOOL = "stop_speaking";

export const SAY_USAGE = "usage: /say [<text>] [--voice <voice>]\n       /say --stop";

export type SayRequest = { kind: "stop" } | { kind: "say"; text: string; voice: string };

export type ParsedSay = { ok: true; request: SayRequest } | { ok: false; error: string };

/** The arguments of /say: --stop alone, or a text (empty: the last answer; quoted, it may start
 *  with --) and a voice. */
export function parseSayArgs(tokens: readonly string[]): ParsedSay {
  const words = splitWords(commandLine(tokens));
  if (words.length === 1 && isOption(words[0]) && words[0].text === "--stop") return { ok: true, request: { kind: "stop" } };
  const text: string[] = [];
  let voice = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i].text;
    if (!isOption(words[i])) {
      text.push(word);
    } else if (word === "--voice") {
      const value = optionValue(words, i++);
      if (value === null) return { ok: false, error: "--voice needs a voice name (fr_FR-siwis-medium, en_US-lessac-medium...)" };
      voice = value;
    } else if (word === "--stop") {
      return { ok: false, error: "--stop takes nothing else" };
    } else {
      return { ok: false, error: `unknown option ${word}` };
    }
  }
  return { ok: true, request: { kind: "say", text: text.join(" ").trim(), voice } };
}

/** The content of the assistant's last message in the session, or "" when there is none. */
export function lastAnswer(messages: ReadonlyArray<{ role: string; content: unknown }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "assistant" && typeof message.content === "string" && message.content.trim()) return message.content;
  }
  return "";
}

/** What /say reads and drives: the registered tools, the session (for the last answer), the crew launch. */
export type SayDeps = LaunchDeps & {
  catalogue: Pick<ToolCatalogue, "find" | "callText">;
  session: Pick<SessionIo, "readMessages">;
};

/** Launch the reading and return its ticket, or the message to show when it launches nothing. */
export async function dispatchSay(tokens: readonly string[], deps: SayDeps): Promise<LaunchResult | { message: string }> {
  const parsed = parseSayArgs(tokens);
  if (!parsed.ok) return { message: `${parsed.error}\n${SAY_USAGE}` };
  const { request } = parsed;
  if (request.kind === "stop") {
    const stop = deps.catalogue.find(STOP_TOOL);
    if (stop === undefined) return { message: missingToolMessage(STOP_TOOL) };
    const outcome = await deps.catalogue.callText(stop, {});
    return { message: outcome.ok ? (outcome.text || "stopped") : `✗ ${STOP_TOOL}: ${outcome.failure}` };
  }
  const speak = deps.catalogue.find(SPEAK_TOOL);
  if (speak === undefined) return { message: missingToolMessage(SPEAK_TOOL) };
  let text = request.text;
  if (!text) {
    try {
      text = lastAnswer((await deps.session.readMessages()).messages);
    } catch (error) {
      return { message: `cannot read the session's last answer: ${errorText(error)}` };
    }
  }
  if (!text) return { message: "nothing to read: give a text, or ask the assistant first (/say alone reads its last answer)" };
  const args: Record<string, unknown> = { text };
  if (request.voice) args.voice = request.voice;
  return launchCrew(deps, "speech", { tool: speak, args, label: request.text ? "text read aloud" : "last answer read aloud" }, {
    characters: text.length, ...(request.voice ? { voice: request.voice } : {}),
  });
}

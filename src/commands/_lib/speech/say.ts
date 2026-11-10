// /say: read a text aloud through the speech MCP server (mcp/whisper), or the
// assistant's last answer when no text is given. The server cleans the Markdown
// off, synthesizes the text (Piper, OpenAI's API or a compatible server) and
// plays it on the speaker when the launcher ran with ORKEON_CODE_VOICE=1;
// otherwise it writes /transcripts/speech.wav and says it played nothing.
//
// The reading is the command's call, made by the speech crew: synthesizing a
// long answer can outlast the 10 s a handler may wait. --stop is a quick call,
// made here.
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { ToolCatalogue } from "../../../shared/application/ports.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { errorText } from "../../../shared/domain/prelude.ts";
import { SPEAK_TOOL } from "../../../shared/domain/speech.ts";
import { commandLine, isOption, optionValue, splitWords } from "../args.ts";
import { launchCrew, withLlmProfile } from "../dispatch.ts";
import type { CommandLog, LaunchDeps, LaunchResult } from "../dispatch.ts";
import { LAST_ANSWER_READ_ALOUD, NOTHING_TO_READ, SAY_USAGE, STOP_ALONE, STOPPED, TEXT_READ_ALOUD, VOICE_NEEDS_NAME, lastAnswerUnreadable, missingToolMessage, toolFailed } from "./messages.ts";
import { unknownOption } from "../messages.ts";

export const STOP_TOOL = "stop_speaking";

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
      if (value === null) return { ok: false, error: VOICE_NEEDS_NAME };
      voice = value;
    } else if (word === "--stop") {
      return { ok: false, error: STOP_ALONE };
    } else {
      return { ok: false, error: unknownOption(word) };
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
  config: Pick<ConfigStore, "readValue" | "readFile">;
  log: Pick<CommandLog, "info" | "warn">;
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
    return { message: outcome.ok ? (outcome.text || STOPPED) : toolFailed(STOP_TOOL, outcome.failure) };
  }
  const speak = deps.catalogue.find(SPEAK_TOOL);
  if (speak === undefined) return { message: missingToolMessage(SPEAK_TOOL) };
  let text = request.text;
  if (!text) {
    try {
      text = lastAnswer((await deps.session.readMessages()).messages);
    } catch (error) {
      return { message: lastAnswerUnreadable(errorText(error)) };
    }
  }
  if (!text) return { message: NOTHING_TO_READ };
  const args: Record<string, unknown> = { text };
  if (request.voice) args.voice = request.voice;
  return launchCrew(await withLlmProfile(deps, deps.config), "speech", { tool: speak, args, label: request.text ? TEXT_READ_ALOUD : LAST_ANSWER_READ_ALOUD }, {
    characters: text.length, ...(request.voice ? { voice: request.voice } : {}),
  });
}

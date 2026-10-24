// /voice: dictate a request. The Whisper MCP server (mcp/whisper) records this
// machine's microphone until a silence and transcribes it (record_and_transcribe,
// refused unless the launcher ran with ORKEON_CODE_VOICE=1).
//
// Three uses, one dictation at a time:
//  - /voice records and shows the text, which the server keeps as
//    /transcripts/dictation.txt: nothing is sent yet (the confirmation);
//  - /voice send sends that text to the assistant, as /assistant would;
//  - /voice --go records and sends at once: the main loop makes the call before
//    the turn and takes its text as the request (a prelude, `as: "request"`).
// Recording and transcribing last longer than the 10 s a handler may wait, so
// the call is made by a crew: the speech crew, or the main loop for --go.
import type { Files, ToolCatalogue } from "../../shared/application/ports.ts";
import { failureText, nothingReturned } from "../../shared/domain/prelude.ts";
import { commandLine, isOption, optionValue, parseAssistantInput, splitWords } from "./args.ts";
import { launchCrew, launchMainLoop } from "./dispatch.ts";
import type { CrewCompletion, LaunchResult, MainLoopLaunchDeps } from "./dispatch.ts";
import { missingToolMessage } from "./transcribe.ts";

export const RECORD_TOOL = "record_and_transcribe";
export const DICTATION_FILE = "/transcripts/dictation.txt";
const DEFAULT_MAX_SECONDS = 60;
const DEFAULT_SILENCE_SECONDS = 2;

export const VOICE_USAGE =
  'usage: /voice [--go] [--lang <code>] [--prompt "<words>"] [--max <seconds>] [--silence <seconds>]\n' +
  "       /voice send";

export type VoiceRequest =
  | { kind: "record"; go: boolean; language: string; vocabulary: string; maxSeconds: number; silenceSeconds: number }
  | { kind: "send" };

export type ParsedVoice = { ok: true; request: VoiceRequest } | { ok: false; error: string };

/** A number option within bounds, or the reason it is not one. */
function seconds(option: string, value: string | null, min: number, max: number): number | string {
  const n = value === null ? Number.NaN : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return `${option} takes seconds between ${min} and ${max}`;
  return n;
}

/** The arguments of /voice: `send` alone, or the recording options. */
export function parseVoiceArgs(tokens: readonly string[]): ParsedVoice {
  const words = splitWords(commandLine(tokens));
  if (words.length === 1 && words[0].text === "send" && !words[0].quoted) return { ok: true, request: { kind: "send" } };
  const request = {
    kind: "record" as const, go: false, language: "", vocabulary: "",
    maxSeconds: DEFAULT_MAX_SECONDS, silenceSeconds: DEFAULT_SILENCE_SECONDS,
  };
  for (let i = 0; i < words.length; i++) {
    const word = words[i].text;
    if (!isOption(words[i])) {
      if (word === "send") return { ok: false, error: "send takes no option and no quotes: /voice send sends the last dictation" };
      return { ok: false, error: `unknown argument ${word}` };
    } else if (word === "--go") {
      request.go = true;
    } else if (word === "--lang" || word === "--language") {
      const value = optionValue(words, i++);
      if (value === null) return { ok: false, error: `${word} needs a language code (fr, en...)` };
      request.language = value;
    } else if (word === "--prompt") {
      const value = optionValue(words, i++);
      if (value === null) return { ok: false, error: '--prompt needs the words the speech may contain, quoted ("Orkeon, Jint, MCP")' };
      request.vocabulary = value;
    } else if (word === "--max" || word === "--silence") {
      const value = optionValue(words, i++);
      const parsed = word === "--max" ? seconds(word, value, 1, 600) : seconds(word, value, 0.5, 10);
      if (typeof parsed === "string") return { ok: false, error: parsed };
      if (word === "--max") request.maxSeconds = parsed;
      else request.silenceSeconds = parsed;
    } else {
      return { ok: false, error: `unknown option ${word}` };
    }
  }
  return { ok: true, request };
}

/** The arguments of record_and_transcribe (the server's parameter names). */
export function recordArgs(request: Extract<VoiceRequest, { kind: "record" }>): Record<string, unknown> {
  const args: Record<string, unknown> = { max_seconds: request.maxSeconds, silence_seconds: request.silenceSeconds };
  if (request.language) args.language = request.language;
  if (request.vocabulary) args.vocabulary = request.vocabulary;
  return args;
}

/** The line shown when the microphone opens. */
export function recordingNotice(request: Extract<VoiceRequest, { kind: "record" }>): string {
  return `🎙 recording: speak, then stay silent ${request.silenceSeconds} s to stop (${request.maxSeconds} s at most)` +
    (request.go ? "; the text goes straight to the assistant" : "");
}

/** What /voice reads and drives: the registered tools, the files (the last dictation, for
 *  send), the crew and main-loop launches, and the console for the recording notice. */
export type VoiceDeps = MainLoopLaunchDeps & {
  catalogue: Pick<ToolCatalogue, "find">;
  files: Pick<Files, "read">;
  out: { writeLine(text: string): void };
};

const NOTHING_TO_SEND = `no dictation to send: /voice records one (it is kept in ${DICTATION_FILE})`;

/** Launch what the request asks and return its ticket, or the message to show when it launches nothing. */
export async function dispatchVoice(tokens: readonly string[], deps: VoiceDeps): Promise<LaunchResult | { message: string }> {
  const parsed = parseVoiceArgs(tokens);
  if (!parsed.ok) return { message: `${parsed.error}\n${VOICE_USAGE}` };
  const { request } = parsed;
  if (request.kind === "send") {
    let text: string;
    try {
      text = (await deps.files.read(DICTATION_FILE)).trim();
    } catch (error) {
      // A missing file is the common case (no dictation yet); the runtime's read says so, as json-file.ts reads it.
      if (/not found|no such|does not exist/i.test(failureText(error))) return { message: NOTHING_TO_SEND };
      return { message: `cannot read ${DICTATION_FILE}: ${failureText(error)}` };
    }
    if (text.length === 0) return { message: NOTHING_TO_SEND };
    const { prompt, permissionMode } = parseAssistantInput(text);
    return await launchMainLoop(deps, { prompt, permissionMode });
  }
  const registered = deps.catalogue.find(RECORD_TOOL);
  if (registered === undefined) return { message: missingToolMessage(RECORD_TOOL) };
  deps.out.writeLine(recordingNotice(request));
  const args = recordArgs(request);
  if (request.go) {
    return await launchMainLoop(deps, {
      prompt: "", permissionMode: null, prelude: { tool: registered, args, label: "Dictation", as: "request" },
    });
  }
  return launchCrew(deps, "speech", { tool: registered, args, label: "dictation" }, args);
}

/**
 * The lines a completion writes: the dictation and what to do with it, or the assistant's answer. The
 * crew that answered is the completion's `intent` (the script host reports every crew as the agent
 * "script-host", and the crew's name as the intent).
 */
export function renderVoiceCompletion(result: CrewCompletion & { agent?: string; intent?: string }): string[] {
  if (!result.success) return [`✗ voice failed: ${result.error ?? "unknown"}`];
  const payload = (result.payload ?? "").trim();
  if (result.intent !== "speech") return [payload];
  // The crew names the tool as the host registers it: compared case aside.
  if (payload.length === 0 || payload.toLowerCase() === nothingReturned(RECORD_TOOL).toLowerCase()) {
    return ["nothing was heard: /voice records again"];
  }
  return [`🎙 ${payload}`, "send it: /voice send · edit it: /assistant <text> · record again: /voice"];
}

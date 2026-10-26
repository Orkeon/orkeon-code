// /transcribe: speech-to-text through the Whisper MCP server (mcp/whisper),
// whose tools the launcher declares when ORKEON_CODE_AUDIO_DIR is set.
//
// The call is the command's: the gate does not ask, and no `tools.extra` entry is
// needed. It is made by a crew, never by this command's handler: a transcription
// lasts minutes, and the engine bounds the promise a handler awaits at 10 s.
// Without --then, the speech crew makes the call and /transcribe prints its
// text; with --then, the main loop makes it before the turn (a prelude) and the
// model reads the instruction, then the transcription.
import type { ToolCatalogue } from "../../../shared/application/ports.ts";
import type { PreludeCall } from "../../../shared/domain/prelude.ts";
import { commandLine, isOption, optionValue, parseAssistantInput, splitWords } from "../args.ts";
import { launchCrew, launchMainLoop } from "../dispatch.ts";
import type { LaunchResult, MainLoopLaunchDeps } from "../dispatch.ts";

export const TRANSCRIBE_TOOL = "transcribe_audio";
export const LIST_AUDIO_TOOL = "list_audio";
export const AUDIO_ROOT = "/audio";

export const TRANSCRIBE_USAGE =
  'usage: /transcribe <file> [--lang <code>] [--prompt "<words>"] [--then "<instruction>"]\n' +
  "       /transcribe --list";

/** What /transcribe was asked: the listing of /audio, or one file. */
export type TranscribeRequest =
  | { kind: "list" }
  | { kind: "file"; path: string; language: string; vocabulary: string; then: string | null };

export type ParsedTranscribe = { ok: true; request: TranscribeRequest } | { ok: false; error: string };

/** A file name under /audio, or a path given as /audio/<file>, as the virtual path. */
export function audioPath(file: string): string {
  const trimmed = file.trim();
  return trimmed.startsWith(AUDIO_ROOT + "/") ? trimmed : `${AUDIO_ROOT}/${trimmed.replace(/^\/+/, "")}`;
}

/**
 * The arguments of /transcribe. `--lang` and `--prompt` take one argument (quoted
 * when it holds spaces), `--then` the rest of the line as typed (it comes last); the
 * file is the one argument that is not an option's.
 */
export function parseTranscribeArgs(tokens: readonly string[]): ParsedTranscribe {
  const line = commandLine(tokens);
  const words = splitWords(line);
  let list = false;
  let file: string | null = null;
  let language = "";
  let vocabulary = "";
  let then: string | null = null;
  for (let i = 0; i < words.length; i++) {
    const word = words[i].text;
    if (!isOption(words[i])) {
      if (word.trim().length === 0) return { ok: false, error: "name a file under /audio (/transcribe --list shows them)" };
      if (file !== null) return { ok: false, error: `one file at a time (${file}, ${word}): quote a name that holds a space` };
      file = word;
    } else if (word === "--list") {
      list = true;
    } else if (word === "--lang" || word === "--language") {
      const value = optionValue(words, i++);
      if (value === null) return { ok: false, error: `${word} needs a language code (fr, en...)` };
      language = value;
    } else if (word === "--prompt") {
      const value = optionValue(words, i++);
      if (value === null) return { ok: false, error: '--prompt needs the words the speech may contain, quoted ("Orkeon, Jint, MCP")' };
      vocabulary = value;
    } else if (word === "--then") {
      // One quoted instruction loses its quotes; otherwise the rest is kept as typed, quotes included.
      const rest = words.slice(i + 1);
      then = (rest.length === 1 ? rest[0].text : line.slice(words[i].end)).trim();
      if (then.length === 0) return { ok: false, error: "--then needs an instruction" };
      break;
    } else {
      return { ok: false, error: `unknown option ${word}` };
    }
  }
  if (list) {
    if (file !== null || then !== null || language || vocabulary) return { ok: false, error: "--list takes no file and no option" };
    return { ok: true, request: { kind: "list" } };
  }
  if (file === null) return { ok: false, error: "name a file under /audio (/transcribe --list shows them)" };
  return { ok: true, request: { kind: "file", path: audioPath(file), language, vocabulary, then } };
}

/** The line that says what to do when the server's tools are not registered. */
export function missingToolMessage(tool: string): string {
  return (
    `no registered tool '${tool}': the Whisper MCP server is not connected. Start orkeon-code with ` +
    "ORKEON_CODE_AUDIO_DIR set (docs/configuration.md, Speech-to-text); /debug-tool-call list shows what this host registers."
  );
}

/** The arguments of transcribe_audio for a file request (the server's parameter names). */
export function transcribeCall(registered: string, request: Extract<TranscribeRequest, { kind: "file" }>, label: string): PreludeCall {
  const args: Record<string, unknown> = { path: request.path };
  if (request.language) args.language = request.language;
  if (request.vocabulary) args.vocabulary = request.vocabulary;
  return { tool: registered, args, label };
}

/** What /transcribe reads and drives: the registered tools, the crew launch and, for --then, the main loop's launch. */
export type TranscribeDeps = MainLoopLaunchDeps & { catalogue: Pick<ToolCatalogue, "find"> };

/**
 * Launch what the request asks and return the ticket: the speech crew for a
 * listing or a file, the main loop with the transcription as its prelude for
 * --then (a `mode:` prefix in the instruction picks the mode, as for /assistant).
 * A bad line, or a server that is not connected, launches nothing and returns
 * the message the REPL prints.
 */
export async function dispatchTranscribe(
  tokens: readonly string[],
  deps: TranscribeDeps,
): Promise<LaunchResult | { message: string }> {
  const parsed = parseTranscribeArgs(tokens);
  if (!parsed.ok) return { message: `${parsed.error}\n${TRANSCRIBE_USAGE}` };
  const { request } = parsed;
  const wanted = request.kind === "list" ? LIST_AUDIO_TOOL : TRANSCRIBE_TOOL;
  const registered = deps.catalogue.find(wanted);
  if (registered === undefined) return { message: missingToolMessage(wanted) };
  if (request.kind === "list") {
    return launchCrew(deps, "speech", { tool: registered, args: {}, label: `the files under ${AUDIO_ROOT}` });
  }
  if (request.then === null) {
    const call = transcribeCall(registered, request, `transcription of ${request.path}`);
    return launchCrew(deps, "speech", { ...call }, call.args);
  }
  const { prompt, permissionMode } = parseAssistantInput(request.then);
  const prelude = transcribeCall(registered, request, `Transcription of ${request.path}, made by /transcribe before this request`);
  return await launchMainLoop(deps, { prompt, permissionMode, prelude });
}

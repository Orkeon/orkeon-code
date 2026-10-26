// Speech use case: the one call to the speech server a command asks for
// (/transcribe without --then and its --list, /voice, /say). The crew makes the
// call: a transcription lasts minutes, a recording or a synthesis seconds, and a
// command's handler cannot wait past 10 s (the engine bounds the promise it
// awaits). The command found the registered name; the answer is the tool's text,
// which the command prints.
import type { Logger, ToolCatalogue } from "../../../shared/application/ports.ts";
import { nothingReturned, parsePrelude, toolFailure } from "../../../shared/domain/prelude.ts";

/** The ports of the call. */
export interface SpeechDeps {
  tools: Pick<ToolCatalogue, "callText">;
  log: Pick<Logger, "info">;
}

/** Make the call the input names and answer its text; a failed call throws the tool's message. */
export async function runSpeech(input: unknown, deps: SpeechDeps): Promise<string> {
  const call = parsePrelude(input);
  if (call === null) throw new Error("no tool to call: this crew is started by /transcribe, /voice or /say");
  deps.log.info(`${call.label}: ${call.tool}`);
  const outcome = await deps.tools.callText(call.tool, call.args);
  if (!outcome.ok) throw toolFailure(call.tool, outcome.failure);
  const text = outcome.text.trim();
  return text.length > 0 ? text : nothingReturned(call.tool);
}

// The tool catalogue runSpeech is tested over.
import { FakeLogger } from "../../../../tests/support/doubles/fake-logger.ts";
import { FakeToolCatalogue } from "../../../../tests/support/doubles/fake-tool-catalogue.ts";

/** A catalogue whose transcribe_audio returns `reply` (thrown when it is an Error). */
export function speechSetup(reply: unknown) {
  const tools = new FakeToolCatalogue();
  tools.tools.set("transcribe_audio", reply);
  const log = new FakeLogger();
  return { tools, log, deps: { tools, log } };
}

/** A transcription's text, its trailer after it. */
export const TRANSCRIPT = "Bonjour.\n\n[language fr (0.99), 3 s, 1 words; written to /transcripts/a.txt]";

/** The failure the runtime wraps around the tool's own message. */
export const WRAPPED_FAILURE = new Error(
  "tools.transcribeAudio failed [path=/audio/x.m4a]: Error executing tool transcribe_audio: no file at /audio/x.m4a",
);

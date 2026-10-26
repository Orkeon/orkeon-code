// The /voice lines with what each parses to, the deps dispatchVoice runs over (FakeCrewHost, FakeToolCatalogue
// registering the names given, FakeFiles for the dictation, the lines written), and the completions it renders.
import { DICTATION_FILE, VOICE_USAGE, recordingNotice, renderVoiceCompletion } from "../../../../src/commands/_lib/speech/voice.ts";
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { createSessionIo } from "../../../../src/shared/application/session-io.ts";
import { FakeCrewHost } from "../../../support/doubles/fake-crew-host.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakePermissionRules } from "../../../support/doubles/fake-permission-rules.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeToolCatalogue } from "../../../support/doubles/fake-tool-catalogue.ts";

export const RECORD = { kind: "record", go: false, language: "", vocabulary: "", maxSeconds: 60, silenceSeconds: 2 };

export const ACCEPTED_CASES: readonly { name: string; tokens: string[]; expected: object }[] = [
  { name: "records with the defaults", tokens: [], expected: { ok: true, request: RECORD } },
  {
    name: "records with the options given",
    tokens: ["--go", "--lang", "fr", "--prompt", `"Orkeon,`, `Jint"`, "--max", "30", "--silence", "1.5"],
    expected: { ok: true, request: { ...RECORD, go: true, language: "fr", vocabulary: "Orkeon, Jint", maxSeconds: 30, silenceSeconds: 1.5 } },
  },
  { name: "reads send alone", tokens: ["send"], expected: { ok: true, request: { kind: "send" } } },
];

const MAX = "--max takes seconds between 1 and 600";
const LANG = "--lang needs a language code (fr, en...)";
const SEND = "send takes no option and no quotes: /voice send sends the last dictation";

export const REFUSED_CASES: readonly { name: string; tokens: string[]; error: string; message?: string }[] = [
  { name: "refuses --max 0", tokens: ["--max", "0"], error: MAX },
  { name: "refuses --max without seconds", tokens: ["--max"], error: MAX },
  { name: "refuses --silence out of range", tokens: ["--silence", "20"], error: "--silence takes seconds between 0.5 and 10" },
  { name: "refuses --lang without a code", tokens: ["--lang"], error: LANG },
  { name: "refuses --lang with an empty quoted code", tokens: ["--lang", `""`], error: LANG },
  { name: "refuses --prompt without words", tokens: ["--prompt"], error: '--prompt needs the words the speech may contain, quoted ("Orkeon, Jint, MCP")' },
  { name: "refuses send with an option", tokens: ["send", "--go"], error: SEND },
  { name: "refuses a quoted send", tokens: [`"send"`], error: SEND },
  { name: "refuses an unknown argument", tokens: ["loud"], error: "unknown argument loud" },
  { name: "refuses an unknown option", tokens: ["--loud"], error: "unknown option --loud", message: "the same words as /transcribe and /say" },
];

export const NOTICE_CASES: readonly { name: string; request: Parameters<typeof recordingNotice>[0]; expected: string }[] = [
  {
    name: "says how to stop the recording",
    request: { ...RECORD, kind: "record" as const },
    expected: "🎙 recording: speak, then stay silent 2 s to stop (60 s at most)",
  },
  {
    name: "says how to stop the recording, and that the text goes to the assistant with --go",
    request: { ...RECORD, kind: "record" as const, go: true, maxSeconds: 30 },
    expected: "🎙 recording: speak, then stay silent 2 s to stop (30 s at most); the text goes straight to the assistant",
  },
];

/** dispatchVoice's deps, the host registering the tools `registered` with their replies. */
export function voiceDeps(...registered: Array<[string, unknown]>) {
  const crews = new FakeCrewHost();
  const store = new FakeSessionStore();
  const config = createConfigStore({ files: new FakeFiles(), session: store });
  const catalogue = new FakeToolCatalogue();
  for (const [name, reply] of registered) catalogue.tools.set(name, reply);
  const files = new FakeFiles();
  const lines: string[] = [];
  const deps = {
    session: createSessionIo({ store, config }), config, catalogue, crews, gate: new FakePermissionRules(), files,
    log: new FakeLogger(), out: { writeLine: (line: string) => lines.push(line) },
  };
  return { crews, catalogue, files, lines, deps };
}

export const NO_DICTATION = `no dictation to send: /voice records one (it is kept in ${DICTATION_FILE})`;

export const MAX_ZERO_MESSAGE = `--max takes seconds between 1 and 600\n${VOICE_USAGE}`;

type Completion = Parameters<typeof renderVoiceCompletion>[0];

export const COMPLETION_CASES: readonly { name: string; completion: Completion; expected: string[]; message?: string }[] = [
  {
    name: "shows a dictation with what to do next",
    completion: { agent: "script-host", intent: "speech", success: true, payload: "fix the parser" },
    expected: ["🎙 fix the parser", "send it: /voice send · edit it: /assistant <text> · record again: /voice"],
  },
  {
    name: "says when nothing was heard",
    completion: { agent: "script-host", intent: "speech", success: true, payload: "record_and_transcribe returned nothing" },
    expected: ["nothing was heard: /voice records again"],
  },
  {
    name: "says when nothing was heard, the tool named as the host registers it",
    completion: { agent: "script-host", intent: "speech", success: true, payload: "Record_And_Transcribe returned nothing" },
    expected: ["nothing was heard: /voice records again"],
    message: "the crew names the tool as the host registers it",
  },
  {
    name: "prints an answer as it is (the crew is the intent)",
    completion: { agent: "script-host", intent: "main-loop", success: true, payload: "Done." },
    expected: ["Done."],
  },
  {
    name: "says the voice failed, with the error",
    completion: { agent: "script-host", intent: "speech", success: false, error: "record_and_transcribe: the microphone is off" },
    expected: ["✗ voice failed: record_and_transcribe: the microphone is off"],
  },
];

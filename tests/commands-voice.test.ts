// commands/_lib/voice.ts: the arguments of /voice, what it launches over a
// FakeCrewHost and a FakeToolCatalogue (the speech crew to show a dictation,
// the main loop to send it, at once with --go), and the lines its completion
// writes. Run:
//   node --test tests/commands-voice.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import {
  DICTATION_FILE, dispatchVoice, parseVoiceArgs, recordingNotice, renderVoiceCompletion, VOICE_USAGE,
} from "../src/commands/_lib/voice.ts";
import { missingToolMessage } from "../src/commands/_lib/transcribe.ts";
import type { MainLoopInputs } from "../src/crews/main-loop/application/run-main-loop.ts";
import { createConfigStore } from "../src/shared/application/config-store.ts";
import { createSessionIo } from "../src/shared/application/session-io.ts";
import { FakeCrewHost } from "./support/fake-crew-host.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakePermissionRules } from "./support/fake-permission-rules.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeToolCatalogue } from "./support/fake-tool-catalogue.ts";

const RECORD = { kind: "record", go: false, language: "", vocabulary: "", maxSeconds: 60, silenceSeconds: 2 };

describe("parseVoiceArgs", () => {
  it("records with the defaults, or the options given; send alone", () => {
    deepStrictEqual(parseVoiceArgs([]), { ok: true, request: RECORD });
    deepStrictEqual(parseVoiceArgs(["--go", "--lang", "fr", "--prompt", `"Orkeon,`, `Jint"`, "--max", "30", "--silence", "1.5"]),
      { ok: true, request: { ...RECORD, go: true, language: "fr", vocabulary: "Orkeon, Jint", maxSeconds: 30, silenceSeconds: 1.5 } });
    deepStrictEqual(parseVoiceArgs(["send"]), { ok: true, request: { kind: "send" } });
  });

  it("refuses what it cannot read, with the reason", () => {
    const error = (tokens: string[]) => { const p = parseVoiceArgs(tokens); return p.ok ? "" : p.error; };
    strictEqual(error(["--max", "0"]), "--max takes seconds between 1 and 600");
    strictEqual(error(["--max"]), "--max takes seconds between 1 and 600");
    strictEqual(error(["--silence", "20"]), "--silence takes seconds between 0.5 and 10");
    strictEqual(error(["--lang"]), "--lang needs a language code (fr, en...)");
    strictEqual(error(["--lang", `""`]), "--lang needs a language code (fr, en...)");
    strictEqual(error(["--prompt"]), '--prompt needs the words the speech may contain, quoted ("Orkeon, Jint, MCP")');
    strictEqual(error(["send", "--go"]), "send takes no option and no quotes: /voice send sends the last dictation");
    strictEqual(error([`"send"`]), "send takes no option and no quotes: /voice send sends the last dictation");
    strictEqual(error(["loud"]), "unknown argument loud");
    strictEqual(error(["--loud"]), "unknown option --loud", "the same words as /transcribe and /say");
  });

  it("says how to stop the recording", () => {
    strictEqual(recordingNotice({ ...RECORD, kind: "record" }), "🎙 recording: speak, then stay silent 2 s to stop (60 s at most)");
    strictEqual(recordingNotice({ ...RECORD, kind: "record", go: true, maxSeconds: 30 }),
      "🎙 recording: speak, then stay silent 2 s to stop (30 s at most); the text goes straight to the assistant");
  });
});

function setup(...registered: Array<[string, unknown]>) {
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

describe("dispatchVoice", () => {
  it("shows the notice and launches the speech crew with the recording call", async () => {
    const { crews, lines, deps } = setup(["record_and_transcribe", ""]);
    deepStrictEqual(await dispatchVoice(["--lang", "fr", "--prompt", "Orkeon"], deps), { ticket: "ticket-1" });
    deepStrictEqual(lines, ["🎙 recording: speak, then stay silent 2 s to stop (60 s at most)"]);
    deepStrictEqual(crews.launches, [{
      name: "speech",
      input: {
        tool: "record_and_transcribe", args: { max_seconds: 60, silence_seconds: 2, language: "fr", vocabulary: "Orkeon" }, label: "dictation",
      },
    }]);
  });

  it("with --go, launches the main loop with the dictation as the request itself", async () => {
    const { crews, deps } = setup(["Record_And_Transcribe", ""]);
    await dispatchVoice(["--go", "--max", "20"], deps);
    strictEqual(crews.launches[0].name, "main-loop");
    const input = crews.launches[0].input as MainLoopInputs;
    strictEqual(input.prompt, "");
    deepStrictEqual(input.prelude, { tool: "Record_And_Transcribe", args: { max_seconds: 20, silence_seconds: 2 }, label: "Dictation", as: "request" });
  });

  it("send reads the last dictation and sends it as /assistant would, mode prefix included", async () => {
    const { crews, files, deps } = setup();
    files.files.set(DICTATION_FILE, "plan: explain the cache layer\n");
    await dispatchVoice(["send"], deps);
    const input = crews.launches[0].input as MainLoopInputs;
    deepStrictEqual([crews.launches[0].name, input.prompt, input.permissionMode], ["main-loop", "explain the cache layer", "plan"]);
  });

  it("launches nothing, and says why: no dictation, no server, a bad line", async () => {
    const nothing = `no dictation to send: /voice records one (it is kept in ${DICTATION_FILE})`;
    const empty = setup();
    empty.files.files.set(DICTATION_FILE, "\n");
    deepStrictEqual(await dispatchVoice(["send"], empty.deps), { message: nothing });
    deepStrictEqual(await dispatchVoice(["send"], setup().deps), { message: nothing }, "no dictation file yet");
    const unreadable = setup();
    unreadable.files.readErrors.set(DICTATION_FILE, new Error("permission denied"));
    deepStrictEqual(await dispatchVoice(["send"], unreadable.deps), { message: `cannot read ${DICTATION_FILE}: permission denied` },
      "a file that cannot be read is not a missing one");
    const bare = setup();
    deepStrictEqual(await dispatchVoice([], bare.deps), { message: missingToolMessage("record_and_transcribe") });
    deepStrictEqual(bare.lines, [], "no notice when nothing records");
    deepStrictEqual(await dispatchVoice(["--max", "0"], bare.deps), { message: `--max takes seconds between 1 and 600\n${VOICE_USAGE}` });
    deepStrictEqual(bare.crews.launches, []);
  });
});

describe("renderVoiceCompletion", () => {
  it("shows a dictation with what to do next, says when nothing was heard, and prints an answer as it is (the crew is the intent)", () => {
    deepStrictEqual(renderVoiceCompletion({ agent: "script-host", intent: "speech", success: true, payload: "fix the parser" }),
      ["🎙 fix the parser", "send it: /voice send · edit it: /assistant <text> · record again: /voice"]);
    deepStrictEqual(renderVoiceCompletion({ agent: "script-host", intent: "speech", success: true, payload: "record_and_transcribe returned nothing" }),
      ["nothing was heard: /voice records again"]);
    deepStrictEqual(renderVoiceCompletion({ agent: "script-host", intent: "speech", success: true, payload: "Record_And_Transcribe returned nothing" }),
      ["nothing was heard: /voice records again"], "the crew names the tool as the host registers it");
    deepStrictEqual(renderVoiceCompletion({ agent: "script-host", intent: "main-loop", success: true, payload: "Done." }), ["Done."]);
    deepStrictEqual(renderVoiceCompletion({ agent: "script-host", intent: "speech", success: false, error: "record_and_transcribe: the microphone is off" }),
      ["✗ voice failed: record_and_transcribe: the microphone is off"]);
  });
});

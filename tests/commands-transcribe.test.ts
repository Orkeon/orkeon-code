// commands/_lib/transcribe.ts: the arguments of /transcribe, and what it launches
// over a FakeCrewHost and a FakeToolCatalogue: the speech crew for a file or the
// listing, the main loop with the transcription as its prelude for --then. Run:
//   node --test tests/commands-transcribe.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import {
  audioPath, dispatchTranscribe, missingToolMessage, parseTranscribeArgs, TRANSCRIBE_USAGE,
} from "../src/commands/_lib/transcribe.ts";
import type { MainLoopInputs } from "../src/crews/main-loop/application/run-main-loop.ts";
import { createConfigStore } from "../src/shared/application/config-store.ts";
import { createSessionIo } from "../src/shared/application/session-io.ts";
import { FakeCrewHost } from "./support/fake-crew-host.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakePermissionRules } from "./support/fake-permission-rules.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeToolCatalogue } from "./support/fake-tool-catalogue.ts";

describe("parseTranscribeArgs", () => {
  const file = (path: string, extra: object = {}) =>
    ({ ok: true, request: { kind: "file", path, language: "", vocabulary: "", then: null, ...extra } });

  it("reads a file under /audio, by name or by virtual path", () => {
    deepStrictEqual(parseTranscribeArgs(["daily.m4a"]), file("/audio/daily.m4a"));
    deepStrictEqual(parseTranscribeArgs(["/audio/team/review.mp4"]), file("/audio/team/review.mp4"));
    strictEqual(audioPath("team/a.wav"), "/audio/team/a.wav");
  });

  it("reads --lang and a quoted --prompt, one argument each, and --then to the end of the line", () => {
    deepStrictEqual(
      parseTranscribeArgs(["daily.m4a", "--lang", "fr", "--prompt", `"Orkeon,`, `Jint"`, "--then", "plan:", "liste", "les", "tâches"]),
      file("/audio/daily.m4a", { language: "fr", vocabulary: "Orkeon, Jint", then: "plan: liste les tâches" }),
    );
    deepStrictEqual(parseTranscribeArgs(["--prompt", "Orkeon, MCP", "a.wav"]), file("/audio/a.wav", { vocabulary: "Orkeon, MCP" }));
    deepStrictEqual(parseTranscribeArgs(["--prompt", `"Orkeon, MCP"`, "a.wav"]), file("/audio/a.wav", { vocabulary: "Orkeon, MCP" }));
  });

  it("keeps the instruction of --then as typed, quotes included, and drops the quotes around a whole one", () => {
    deepStrictEqual(parseTranscribeArgs(["a.wav", "--then", "find", "where", "they", "say", `"deadline"`]),
      file("/audio/a.wav", { then: `find where they say "deadline"` }));
    deepStrictEqual(parseTranscribeArgs(["a.wav", "--then", `"list`, "the", `tasks"`]), file("/audio/a.wav", { then: "list the tasks" }));
    deepStrictEqual(parseTranscribeArgs([`"--odd`, `name.wav"`]), file("/audio/--odd name.wav"), "a quoted name is never an option");
  });

  it("reads --list alone", () => {
    deepStrictEqual(parseTranscribeArgs(["--list"]), { ok: true, request: { kind: "list" } });
  });

  it("refuses what it cannot read, with the reason", () => {
    const error = (tokens: string[]) => { const p = parseTranscribeArgs(tokens); return p.ok ? "" : p.error; };
    strictEqual(error([]), "name a file under /audio (/transcribe --list shows them)");
    strictEqual(error([`""`]), "name a file under /audio (/transcribe --list shows them)");
    strictEqual(error(["a.wav", "--lang"]), "--lang needs a language code (fr, en...)");
    strictEqual(error(["a.wav", "--lang", "--then", "x"]), "--lang needs a language code (fr, en...)");
    strictEqual(error(["a.wav", "--lang", `""`]), "--lang needs a language code (fr, en...)");
    strictEqual(error(["a.wav", "--prompt", "--lang", "fr"]), '--prompt needs the words the speech may contain, quoted ("Orkeon, Jint, MCP")');
    strictEqual(error(["a.wav", "--prompt", "Orkeon", "Jint"]), "one file at a time (a.wav, Jint): quote a name that holds a space");
    strictEqual(error(["a.wav", "--then"]), "--then needs an instruction");
    strictEqual(error(["a.wav", "--fast"]), "unknown option --fast");
    strictEqual(error(["a.wav", "b.wav"]), "one file at a time (a.wav, b.wav): quote a name that holds a space");
    strictEqual(error(["--list", "a.wav"]), "--list takes no file and no option");
  });
});

function setup(...registered: string[]) {
  const crews = new FakeCrewHost();
  const store = new FakeSessionStore();
  const config = createConfigStore({ files: new FakeFiles(), session: store });
  const catalogue = new FakeToolCatalogue();
  for (const name of registered) catalogue.tools.set(name, "");
  const log = new FakeLogger();
  const deps = { session: createSessionIo({ store, config }), config, catalogue, crews, gate: new FakePermissionRules(), log };
  return { crews, catalogue, log, deps };
}

describe("dispatchTranscribe", () => {
  it("launches the speech crew with the call, under the name the host registers", async () => {
    const { crews, deps } = setup("Transcribe_Audio", "list_audio");
    deepStrictEqual(await dispatchTranscribe(["daily.m4a", "--lang", "fr", "--prompt", "Orkeon"], deps), { ticket: "ticket-1" });
    deepStrictEqual(crews.launches, [{
      name: "speech",
      input: { tool: "Transcribe_Audio", args: { path: "/audio/daily.m4a", language: "fr", vocabulary: "Orkeon" }, label: "transcription of /audio/daily.m4a" },
    }]);
  });

  it("passes only the arguments given, and lists /audio with list_audio", async () => {
    const { crews, deps } = setup("transcribe_audio", "list_audio");
    await dispatchTranscribe(["a.wav"], deps);
    await dispatchTranscribe(["--list"], deps);
    deepStrictEqual(crews.launches.map((l) => l.input), [
      { tool: "transcribe_audio", args: { path: "/audio/a.wav" }, label: "transcription of /audio/a.wav" },
      { tool: "list_audio", args: {}, label: "the files under /audio" },
    ]);
  });

  it("with --then, launches the main loop with the transcription as its prelude, in the mode the instruction names", async () => {
    const { crews, deps } = setup("transcribe_audio");
    await dispatchTranscribe(["daily.m4a", "--lang", "fr", "--then", "plan: list the tasks I mention"], deps);
    strictEqual(crews.launches.length, 1);
    strictEqual(crews.launches[0].name, "main-loop");
    const input = crews.launches[0].input as MainLoopInputs;
    strictEqual(input.prompt, "list the tasks I mention");
    strictEqual(input.permissionMode, "plan");
    deepStrictEqual(input.prelude, {
      tool: "transcribe_audio", args: { path: "/audio/daily.m4a", language: "fr" },
      label: "Transcription of /audio/daily.m4a, made by /transcribe before this request",
    });
  });

  it("launches nothing on a bad line or without the server, and says why: the usage, or what to set", async () => {
    const { crews, deps } = setup();
    deepStrictEqual(await dispatchTranscribe(["--fast"], deps), { message: `unknown option --fast\n${TRANSCRIBE_USAGE}` });
    deepStrictEqual(await dispatchTranscribe(["a.wav"], deps), { message: missingToolMessage("transcribe_audio") });
    deepStrictEqual(await dispatchTranscribe(["--list"], deps), { message: missingToolMessage("list_audio") });
    deepStrictEqual(crews.launches, []);
  });
});

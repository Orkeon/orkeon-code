// The /transcribe lines with what each parses to, and the deps dispatchTranscribe runs over (FakeCrewHost,
// FakeToolCatalogue registering the names given, a config store on FakeSessionStore).
import { TRANSCRIBE_USAGE, missingToolMessage } from "../src/commands/_lib/transcribe.ts";
import { createConfigStore } from "../src/shared/application/config-store.ts";
import { createSessionIo } from "../src/shared/application/session-io.ts";
import { FakeCrewHost } from "./support/fake-crew-host.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakePermissionRules } from "./support/fake-permission-rules.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeToolCatalogue } from "./support/fake-tool-catalogue.ts";

/** The parse of a file request: `path`, with no option but those of `extra`. */
export function fileRequest(path: string, extra: object = {}) {
  return { ok: true, request: { kind: "file", path, language: "", vocabulary: "", then: null, ...extra } };
}

export const FILE_CASES: readonly { name: string; tokens: string[]; expected: object; message?: string }[] = [
  { name: "reads a file under /audio by name", tokens: ["daily.m4a"], expected: fileRequest("/audio/daily.m4a") },
  { name: "reads a file under /audio by virtual path", tokens: ["/audio/team/review.mp4"], expected: fileRequest("/audio/team/review.mp4") },
  {
    name: "reads --lang and a quoted --prompt, one argument each, and --then to the end of the line",
    tokens: ["daily.m4a", "--lang", "fr", "--prompt", `"Orkeon,`, `Jint"`, "--then", "plan:", "liste", "les", "tâches"],
    expected: fileRequest("/audio/daily.m4a", { language: "fr", vocabulary: "Orkeon, Jint", then: "plan: liste les tâches" }),
  },
  {
    name: "reads a --prompt token holding a blank as one argument",
    tokens: ["--prompt", "Orkeon, MCP", "a.wav"],
    expected: fileRequest("/audio/a.wav", { vocabulary: "Orkeon, MCP" }),
  },
  {
    name: "reads a quoted --prompt token holding a blank as one argument, its quotes dropped",
    tokens: ["--prompt", `"Orkeon, MCP"`, "a.wav"],
    expected: fileRequest("/audio/a.wav", { vocabulary: "Orkeon, MCP" }),
  },
  {
    name: "keeps the instruction of --then as typed, quotes included",
    tokens: ["a.wav", "--then", "find", "where", "they", "say", `"deadline"`],
    expected: fileRequest("/audio/a.wav", { then: `find where they say "deadline"` }),
  },
  {
    name: "drops the quotes around a whole --then instruction",
    tokens: ["a.wav", "--then", `"list`, "the", `tasks"`],
    expected: fileRequest("/audio/a.wav", { then: "list the tasks" }),
  },
  {
    name: "never reads a quoted name as an option",
    tokens: [`"--odd`, `name.wav"`],
    expected: fileRequest("/audio/--odd name.wav"),
    message: "a quoted name is never an option",
  },
];

const NO_FILE = "name a file under /audio (/transcribe --list shows them)";
const NO_LANG = "--lang needs a language code (fr, en...)";

export const REFUSED_CASES: readonly { name: string; tokens: string[]; error: string }[] = [
  { name: "refuses an empty line", tokens: [], error: NO_FILE },
  { name: "refuses an empty quoted name", tokens: [`""`], error: NO_FILE },
  { name: "refuses --lang without a code", tokens: ["a.wav", "--lang"], error: NO_LANG },
  { name: "refuses --lang followed by an option", tokens: ["a.wav", "--lang", "--then", "x"], error: NO_LANG },
  { name: "refuses --lang with an empty quoted code", tokens: ["a.wav", "--lang", `""`], error: NO_LANG },
  {
    name: "refuses --prompt followed by an option",
    tokens: ["a.wav", "--prompt", "--lang", "fr"],
    error: '--prompt needs the words the speech may contain, quoted ("Orkeon, Jint, MCP")',
  },
  {
    name: "refuses an unquoted --prompt of two words, the second read as a file",
    tokens: ["a.wav", "--prompt", "Orkeon", "Jint"],
    error: "one file at a time (a.wav, Jint): quote a name that holds a space",
  },
  { name: "refuses --then without an instruction", tokens: ["a.wav", "--then"], error: "--then needs an instruction" },
  { name: "refuses an unknown option", tokens: ["a.wav", "--fast"], error: "unknown option --fast" },
  { name: "refuses two files", tokens: ["a.wav", "b.wav"], error: "one file at a time (a.wav, b.wav): quote a name that holds a space" },
  { name: "refuses --list with a file", tokens: ["--list", "a.wav"], error: "--list takes no file and no option" },
];

/** dispatchTranscribe's deps, the host registering the tools `registered`. */
export function transcribeDeps(...registered: string[]) {
  const crews = new FakeCrewHost();
  const store = new FakeSessionStore();
  const config = createConfigStore({ files: new FakeFiles(), session: store });
  const catalogue = new FakeToolCatalogue();
  for (const name of registered) catalogue.tools.set(name, "");
  const log = new FakeLogger();
  const deps = { session: createSessionIo({ store, config }), config, catalogue, crews, gate: new FakePermissionRules(), log };
  return { crews, catalogue, log, deps };
}

export const NOTHING_LAUNCHED_CASES: readonly { name: string; tokens: string[]; message: string }[] = [
  { name: "a bad line, with the usage", tokens: ["--fast"], message: `unknown option --fast\n${TRANSCRIBE_USAGE}` },
  { name: "a file without the server, with what to set", tokens: ["a.wav"], message: missingToolMessage("transcribe_audio") },
  { name: "--list without the server, with what to set", tokens: ["--list"], message: missingToolMessage("list_audio") },
];

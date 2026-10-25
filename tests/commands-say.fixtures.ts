// Lines typed after /say, buffers it reads the last answer from, and the hosts it launches over.
import { SAY_USAGE, type SayRequest } from "../src/commands/_lib/say.ts";
import { missingToolMessage } from "../src/commands/_lib/transcribe.ts";
import { FakeCrewHost } from "./support/doubles/fake-crew-host.ts";
import { FakeLogger } from "./support/doubles/fake-logger.ts";
import { FakeSessionStore } from "./support/doubles/fake-session-store.ts";
import { FakeToolCatalogue } from "./support/doubles/fake-tool-catalogue.ts";

export interface ReadCase {
  name: string;
  tokens: readonly string[];
  request: SayRequest;
}

/** A text, quoted or not, and a voice; --stop alone. */
export const READ_CASES: readonly ReadCase[] = [
  { name: "a text unquoted", tokens: ["Bonjour", "à", "tous"], request: { kind: "say", text: "Bonjour à tous", voice: "" } },
  {
    name: "a voice and a quoted text",
    tokens: ["--voice", "en_US-lessac-medium", `"Hello there"`],
    request: { kind: "say", text: "Hello there", voice: "en_US-lessac-medium" },
  },
  { name: "nothing", tokens: [], request: { kind: "say", text: "", voice: "" } },
  { name: "--stop alone", tokens: ["--stop"], request: { kind: "stop" } },
];

/** A quoted text that starts with --, and an unclosed quote read as a letter. */
export const QUOTE_CASES: readonly ReadCase[] = [
  { name: "a quoted text that starts with --", tokens: [`"--stop"`], request: { kind: "say", text: "--stop", voice: "" } },
  { name: "an unclosed quote", tokens: ["the", "'90s", "--voice", "x"], request: { kind: "say", text: "the '90s", voice: "x" } },
];

const NO_VOICE = "--voice needs a voice name (fr_FR-siwis-medium, en_US-lessac-medium...)";

export const REFUSED_CASES: readonly { name: string; tokens: readonly string[]; error: string }[] = [
  { name: "--voice without a name", tokens: ["--voice"], error: NO_VOICE },
  { name: "--voice with an empty name", tokens: ["--voice", `""`, "hello"], error: NO_VOICE },
  { name: "--stop with a text", tokens: ["hello", "--stop"], error: "--stop takes nothing else" },
  { name: "an unknown option", tokens: ["--loud", "hello"], error: "unknown option --loud" },
];

type Message = { role: string; content: unknown };

export const LAST_ANSWER_CASES: readonly { name: string; messages: readonly Message[]; answer: string }[] = [
  {
    name: "the assistant's last message with content, an empty one skipped",
    messages: [
      { role: "user", content: "q1" }, { role: "assistant", content: "a1" },
      { role: "user", content: "q2" }, { role: "assistant", content: "  " },
    ],
    answer: "a1",
  },
  { name: "nothing when the assistant has not answered", messages: [{ role: "user", content: "q" }], answer: "" },
];

/** The hosts dispatchSay launches over, the catalogue holding the `registered` tools with their replies. */
export function sayDeps(...registered: Array<[string, unknown]>) {
  const crews = new FakeCrewHost();
  const store = new FakeSessionStore();
  const catalogue = new FakeToolCatalogue();
  for (const [name, reply] of registered) catalogue.tools.set(name, reply);
  return { crews, store, catalogue, deps: { crews, catalogue, session: store, log: new FakeLogger() } };
}

/** Lines that launch nothing, each with the tools the catalogue holds and the message it gives instead. */
export const NOTHING_LAUNCHED: readonly { name: string; tokens: readonly string[]; registered: Array<[string, unknown]>; message: string }[] = [
  { name: "a bad line", tokens: ["--loud"], registered: [], message: `unknown option --loud\n${SAY_USAGE}` },
  { name: "no speech server", tokens: ["hello"], registered: [], message: missingToolMessage("speak") },
  { name: "no server to stop", tokens: ["--stop"], registered: [], message: missingToolMessage("stop_speaking") },
];

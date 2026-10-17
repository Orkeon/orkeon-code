// commands/_lib/say.ts: the arguments of /say, the last answer it reads when no
// text is given, and what it launches over a FakeCrewHost and a FakeToolCatalogue.
// Run:
//   node --test tests/commands-say.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { dispatchSay, lastAnswer, parseSayArgs, SAY_USAGE } from "../src/commands/_lib/say.ts";
import { missingToolMessage } from "../src/commands/_lib/transcribe.ts";
import { FakeCrewHost } from "./support/fake-crew-host.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeToolCatalogue } from "./support/fake-tool-catalogue.ts";

describe("parseSayArgs", () => {
  it("reads a text, quoted or not, and a voice; --stop alone", () => {
    deepStrictEqual(parseSayArgs(["Bonjour", "à", "tous"]), { ok: true, request: { kind: "say", text: "Bonjour à tous", voice: "" } });
    deepStrictEqual(parseSayArgs(["--voice", "en_US-lessac-medium", `"Hello there"`]),
      { ok: true, request: { kind: "say", text: "Hello there", voice: "en_US-lessac-medium" } });
    deepStrictEqual(parseSayArgs([]), { ok: true, request: { kind: "say", text: "", voice: "" } });
    deepStrictEqual(parseSayArgs(["--stop"]), { ok: true, request: { kind: "stop" } });
  });

  it("reads a quoted text as a text, even one that starts with --, and an unclosed quote as a letter", () => {
    deepStrictEqual(parseSayArgs([`"--stop"`]), { ok: true, request: { kind: "say", text: "--stop", voice: "" } });
    deepStrictEqual(parseSayArgs(["the", "'90s", "--voice", "x"]), { ok: true, request: { kind: "say", text: "the '90s", voice: "x" } });
  });

  it("refuses what it cannot read, with the reason", () => {
    const error = (tokens: string[]) => { const p = parseSayArgs(tokens); return p.ok ? "" : p.error; };
    strictEqual(error(["--voice"]), "--voice needs a voice name (fr_FR-siwis-medium, en_US-lessac-medium...)");
    strictEqual(error(["--voice", `""`, "hello"]), "--voice needs a voice name (fr_FR-siwis-medium, en_US-lessac-medium...)");
    strictEqual(error(["hello", "--stop"]), "--stop takes nothing else");
    strictEqual(error(["--loud", "hello"]), "unknown option --loud");
  });
});

describe("lastAnswer", () => {
  it("takes the content of the assistant's last message, skipping empty ones", () => {
    strictEqual(lastAnswer([
      { role: "user", content: "q1" }, { role: "assistant", content: "a1" },
      { role: "user", content: "q2" }, { role: "assistant", content: "  " },
    ]), "a1");
    strictEqual(lastAnswer([{ role: "user", content: "q" }]), "");
  });
});

function setup(...registered: Array<[string, unknown]>) {
  const crews = new FakeCrewHost();
  const store = new FakeSessionStore();
  const catalogue = new FakeToolCatalogue();
  for (const [name, reply] of registered) catalogue.tools.set(name, reply);
  return { crews, store, catalogue, deps: { crews, catalogue, session: store, log: new FakeLogger() } };
}

describe("dispatchSay", () => {
  it("reads a text through the speech crew, with the voice asked", async () => {
    const { crews, deps } = setup(["speak", ""]);
    deepStrictEqual(await dispatchSay(["--voice", "en_US-lessac-medium", "Hello"], deps), { ticket: "ticket-1" });
    deepStrictEqual(crews.launches, [{
      name: "speech", input: { tool: "speak", args: { text: "Hello", voice: "en_US-lessac-medium" }, label: "text read aloud" },
    }]);
  });

  it("reads the assistant's last answer when no text is given", async () => {
    const { crews, store, deps } = setup(["Speak", ""]);
    store.messages = [{ role: "user", content: "fix it" }, { role: "assistant", content: "**Done**: the parser is fixed." }];
    await dispatchSay([], deps);
    deepStrictEqual(crews.launches[0].input, { tool: "Speak", args: { text: "**Done**: the parser is fixed." }, label: "last answer read aloud" });
  });

  it("stops at once, through stop_speaking", async () => {
    const { crews, catalogue, deps } = setup(["speak", ""], ["stop_speaking", "stopped"]);
    deepStrictEqual(await dispatchSay(["--stop"], deps), { message: "stopped" });
    deepStrictEqual([catalogue.calls, crews.launches], [[{ name: "stop_speaking", args: {} }], []]);
  });

  it("launches nothing, and says why: a bad line, no server, nothing to read", async () => {
    deepStrictEqual(await dispatchSay(["--loud"], setup().deps), { message: `unknown option --loud\n${SAY_USAGE}` });
    deepStrictEqual(await dispatchSay(["hello"], setup().deps), { message: missingToolMessage("speak") });
    deepStrictEqual(await dispatchSay(["--stop"], setup().deps), { message: missingToolMessage("stop_speaking") });
    const empty = setup(["speak", ""]);
    deepStrictEqual(await dispatchSay([], empty.deps),
      { message: "nothing to read: give a text, or ask the assistant first (/say alone reads its last answer)" });
    deepStrictEqual(empty.crews.launches, []);
  });

  it("says what failed when the server or the session cannot answer, instead of failing the command", async () => {
    const gone = setup(["stop_speaking", new Error("Error executing tool stop_speaking: connection closed")]);
    deepStrictEqual(await dispatchSay(["--stop"], gone.deps), { message: "✗ stop_speaking: connection closed" });
    const unreadable = setup(["speak", ""]);
    unreadable.deps.session = { readMessages: async () => { throw new Error("session buffer unreadable"); } } as never;
    deepStrictEqual(await dispatchSay([], unreadable.deps), { message: "cannot read the session's last answer: session buffer unreadable" });
    deepStrictEqual(unreadable.crews.launches, []);
  });
});

// commands/_lib/say.ts: the arguments of /say, the last answer it reads when no
// text is given, and what it launches over a FakeCrewHost and a FakeToolCatalogue.
// Run:
//   node --test src/commands/_lib/say.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { dispatchSay, lastAnswer, parseSayArgs } from "./say.ts";
import { LAST_ANSWER_CASES, NOTHING_LAUNCHED, QUOTE_CASES, READ_CASES, REFUSED_CASES, sayDeps } from "./say.fixtures.ts";

describe("parseSayArgs", () => {
  for (const c of READ_CASES) {
    it(`reads a text, quoted or not, and a voice; --stop alone: ${c.name}`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseSayArgs(tokens);

      // Assert
      deepStrictEqual(parsed, { ok: true, request: c.request });
    });
  }

  for (const c of QUOTE_CASES) {
    it(`reads a quoted text as a text, even one that starts with --, and an unclosed quote as a letter: ${c.name}`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseSayArgs(tokens);

      // Assert
      deepStrictEqual(parsed, { ok: true, request: c.request });
    });
  }

  for (const c of REFUSED_CASES) {
    it(`refuses what it cannot read, with the reason: ${c.name}`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseSayArgs(tokens);

      // Assert
      strictEqual(parsed.ok ? "" : parsed.error, c.error);
    });
  }
});

describe("lastAnswer", () => {
  for (const c of LAST_ANSWER_CASES) {
    it(`takes the content of the assistant's last message, skipping empty ones: ${c.name}`, () => {
      // Arrange
      const { messages } = c;

      // Act
      const answer = lastAnswer(messages);

      // Assert
      strictEqual(answer, c.answer);
    });
  }
});

describe("dispatchSay", () => {
  it("reads a text through the speech crew, with the voice asked", async () => {
    // Arrange
    const { crews, deps } = sayDeps(["speak", ""]);

    // Act
    const result = await dispatchSay(["--voice", "en_US-lessac-medium", "Hello"], deps);

    // Assert
    deepStrictEqual(result, { ticket: "ticket-1" });
    deepStrictEqual(crews.launches, [{
      name: "speech", input: { tool: "speak", args: { text: "Hello", voice: "en_US-lessac-medium" }, label: "text read aloud" },
    }]);
  });

  it("reads the assistant's last answer when no text is given", async () => {
    // Arrange
    const { crews, store, deps } = sayDeps(["Speak", ""]);
    store.messages = [{ role: "user", content: "fix it" }, { role: "assistant", content: "**Done**: the parser is fixed." }];

    // Act
    await dispatchSay([], deps);

    // Assert
    deepStrictEqual(crews.launches[0].input, { tool: "Speak", args: { text: "**Done**: the parser is fixed." }, label: "last answer read aloud" });
  });

  it("stops at once, through stop_speaking", async () => {
    // Arrange
    const { crews, catalogue, deps } = sayDeps(["speak", ""], ["stop_speaking", "stopped"]);

    // Act
    const result = await dispatchSay(["--stop"], deps);

    // Assert
    deepStrictEqual(result, { message: "stopped" });
    deepStrictEqual([catalogue.calls, crews.launches], [[{ name: "stop_speaking", args: {} }], []]);
  });

  for (const c of NOTHING_LAUNCHED) {
    it(`launches nothing, and says why: ${c.name}`, async () => {
      // Arrange
      const { deps } = sayDeps(...c.registered);

      // Act
      const result = await dispatchSay(c.tokens, deps);

      // Assert
      deepStrictEqual(result, { message: c.message });
    });
  }

  it("launches nothing, and says why: nothing to read", async () => {
    // Arrange
    const { crews, deps } = sayDeps(["speak", ""]);

    // Act
    const result = await dispatchSay([], deps);

    // Assert
    deepStrictEqual(result, { message: "nothing to read: give a text, or ask the assistant first (/say alone reads its last answer)" });
    deepStrictEqual(crews.launches, []);
  });

  it("says what failed when the server cannot answer, instead of failing the command", async () => {
    // Arrange
    const { deps } = sayDeps(["stop_speaking", new Error("connection closed")]);

    // Act
    const result = await dispatchSay(["--stop"], deps);

    // Assert
    deepStrictEqual(result, { message: "✗ stop_speaking: connection closed" });
  });

  it("says what failed when the session cannot answer, instead of failing the command", async () => {
    // Arrange
    const { crews, deps } = sayDeps(["speak", ""]);
    deps.session = { readMessages: async () => { throw new Error("session buffer unreadable"); } } as never;

    // Act
    const result = await dispatchSay([], deps);

    // Assert
    deepStrictEqual(result, { message: "cannot read the session's last answer: session buffer unreadable" });
    deepStrictEqual(crews.launches, []);
  });
});

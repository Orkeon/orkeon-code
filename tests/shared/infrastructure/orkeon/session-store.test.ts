// The SessionStore adapter over FakeTools session_store / token_budget, in both
// casings the runtime hands back. Run:
//   node --test tests/shared/infrastructure/orkeon/session-store.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createSessionStore } from "../../../../src/shared/infrastructure/orkeon/session-store.ts";
import { compactSession } from "../../../../src/shared/application/compaction/compact-session.ts";
import { FakeTools } from "../../../support/doubles/fake-tools.ts";
import { BUDGETS, FORCES, NOT_A_LIST, RESET_COUNTS, SATURATED_BUDGET, STATE_VALUES, THREE_TURNS, compactionDeps, operationsOf, storeFailingAppend, storeWithoutAppend } from "./session-store.fixtures.ts";

describe("createSessionStore — a failed read", () => {
  it("rethrows a failed read of the buffer with the tool's own message, without the runtime's wrapping", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = new Error("tools.sessionStore failed [operation=read_messages]: session buffer unreadable");

    // Act
    const act = createSessionStore(tools).readMessages();

    // Assert
    await rejects(act, (e: Error) => e.message === "session buffer unreadable");
  });

  it("rethrows a failed read of the state bag with the tool's own message, without the runtime's wrapping", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = new Error("tools.sessionStore failed [operation=get_state]: no session tools");

    // Act
    const act = createSessionStore(tools).readState("k");

    // Assert
    await rejects(act, (e: Error) => e.message === "no session tools");
  });
});

describe("createSessionStore — messages", () => {
  it("reads `messages` and gives each entry's role and content", async () => {
    // Arrange
    const tools = new FakeTools();
    const stored = [{ role: "user", content: "hi", subtype: "x" }, { role: "assistant", content: "hello" }];
    tools.replies.sessionStore = { messages: stored };

    // Act
    const read = await createSessionStore(tools).readMessages();

    // Assert
    strictEqual(read.stored, stored, "the entries come back as stored, extra fields included");
    deepStrictEqual(read.messages, [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }]);
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "read_messages" }]);
  });

  it("reads `Messages` with PascalCase entries", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = { Messages: [{ Role: "user", Content: "hi" }] };

    // Act
    const read = await createSessionStore(tools).readMessages();

    // Assert
    deepStrictEqual(read.messages, [{ role: "user", content: "hi" }]);
  });

  it("reads an empty buffer when the result has no messages", async () => {
    // Arrange
    const session = createSessionStore(new FakeTools());

    // Act
    const read = await session.readMessages();

    // Assert
    deepStrictEqual(read, { stored: [], messages: [] });
  });

  for (const messages of NOT_A_LIST) {
    it(`reads a buffer that is not a list as empty: ${JSON.stringify(messages)}`, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.sessionStore = { messages };

      // Act
      const read = await createSessionStore(tools).readMessages();

      // Assert
      deepStrictEqual(read, { stored: [], messages: [] });
    });

    for (const force of FORCES) {
      it(`skips the compaction of a buffer that is not a list rather than failing: ${JSON.stringify(messages)}, force ${force}`, async () => {
        // Arrange
        const tools = new FakeTools();
        tools.replies.sessionStore = { messages };
        tools.replies.tokenBudget = SATURATED_BUDGET;
        const deps = compactionDeps(createSessionStore(tools));

        // Act
        const outcome = await compactSession({ force }, deps);

        // Assert
        deepStrictEqual(outcome, { status: "skipped", reason: "buffer too small" });
      });
    }
  }

  it("writes the buffer as given", async () => {
    // Arrange
    const tools = new FakeTools();
    const buffer = [{ role: "system", content: "[compacted]" }];

    // Act
    await createSessionStore(tools).writeMessages(buffer);

    // Assert
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "write_messages", messages: buffer }]);
  });
});

describe("createSessionStore — reset, snip and title", () => {
  it("resets the buffer and reads the removed count", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = { removed_count: 4 };

    // Act
    const removed = await createSessionStore(tools).reset();

    // Assert
    strictEqual(removed, 4);
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "reset" }]);
  });

  for (const c of RESET_COUNTS) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.sessionStore = c.reply;

      // Act
      const removed = await createSessionStore(tools).reset();

      // Assert
      strictEqual(removed, c.expected);
    });
  }

  it("asks session_snip for the turns to keep on a runtime that has edge_list, and reads both counts", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionSnip = { RemovedCount: 12, RetainedCount: 7 };

    // Act
    const counts = await createSessionStore(tools).snip(3);

    // Assert
    deepStrictEqual(counts, { removed: 12, retained: 7 });
    deepStrictEqual(tools.inputsOf("sessionSnip"), [{ retain_count: 3 }]);
  });

  it("asks session_snip for the messages the last turns hold on the release, which counts messages", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.release = true;
    tools.replies.sessionStore = { messages: THREE_TURNS };

    // Act
    await createSessionStore(tools).snip(2);

    // Assert
    deepStrictEqual(tools.inputsOf("sessionSnip"), [{ retain_count: 5 }]);
  });

  it("leaves the buffer as it is on the release when it holds fewer turns than asked", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.release = true;
    tools.replies.sessionStore = { messages: THREE_TURNS };

    // Act
    const counts = await createSessionStore(tools).snip(4);

    // Assert
    deepStrictEqual({ counts, snips: tools.inputsOf("sessionSnip") }, { counts: { removed: 0, retained: 9 }, snips: [] });
  });

  it("reads a snip's snake_case removed count, and an unreported retained count as 0", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionSnip = { removed_count: 1 };

    // Act
    const counts = await createSessionStore(tools).snip(5);

    // Assert
    deepStrictEqual(counts, { removed: 1, retained: 0 });
  });

  it("sets the title", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createSessionStore(tools).setTitle("parser fix");

    // Assert
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "set_title", title: "parser fix" }]);
  });
});

describe("createSessionStore — state", () => {
  it("reads `value` as a string", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = { value: "plan" };

    // Act
    const value = await createSessionStore(tools).readState("k");

    // Assert
    strictEqual(value, "plan");
    deepStrictEqual(tools.inputsOf("sessionStore")[0], { operation: "get_state", key: "k" });
  });

  it("reads `Value` as a string", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = { Value: 3 };

    // Act
    const value = await createSessionStore(tools).readState("k");

    // Assert
    strictEqual(value, "3");
  });

  it("reads null for an unset key", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = { success: true, value: null };

    // Act
    const value = await createSessionStore(tools).readState("k");

    // Assert
    strictEqual(value, null);
  });

  it("writes a value", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createSessionStore(tools).writeState("k", "v");

    // Assert
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "set_state", key: "k", value: "v" }]);
  });

  it("writes null to remove a value", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createSessionStore(tools).writeState("k", null);

    // Assert
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "set_state", key: "k", value: null }]);
  });
});

describe("createSessionStore — several state keys", () => {
  it("reads several keys in one get_state call", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createSessionStore(tools).readStates(["a", "b"]);

    // Assert
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "get_state", keys: ["a", "b"] }]);
  });

  for (const c of STATE_VALUES) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.sessionStore = c.reply;

      // Act
      const values = await createSessionStore(tools).readStates(["a", "missing"]);

      // Assert
      deepStrictEqual(values, c.expected);
    });
  }

  it("reads no key without a call", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    const values = await createSessionStore(tools).readStates([]);

    // Assert
    deepStrictEqual([values, tools.calls], [{}, []]);
  });
});

describe("createSessionStore — append", () => {
  it("appends one message in one append_message call", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = { success: true };

    // Act
    await createSessionStore(tools).appendMessage("assistant", "done");

    // Assert
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "append_message", role: "assistant", content: "done" }]);
  });

  it("throws when the store refuses the append", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = { success: false };

    // Act
    const act = createSessionStore(tools).appendMessage("", "done");

    // Assert
    await rejects(act, /session_store refused to append a '' message/);
  });

  it("appends by reading and rewriting the buffer on a runtime without append_message", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = storeWithoutAppend;

    // Act
    await createSessionStore(tools).appendMessage("assistant", "done");

    // Assert
    deepStrictEqual(tools.inputsOf("sessionStore").slice(1), [
      { operation: "read_messages" },
      { operation: "write_messages", messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "done" }] },
    ]);
  });

  it("remembers a missing append_message and rewrites the buffer at once on the next append", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = storeWithoutAppend;
    const store = createSessionStore(tools);
    await store.appendMessage("user", "fix it");

    // Act
    await store.appendMessage("assistant", "done");

    // Assert
    deepStrictEqual(operationsOf(tools.inputsOf("sessionStore")), [
      "append_message", "read_messages", "write_messages", "read_messages", "write_messages",
    ]);
  });

  it("rethrows an append failure other than an unknown operation without rewriting the buffer", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = storeFailingAppend("tools.sessionStore failed: session buffer locked");

    // Act
    const outcome = await createSessionStore(tools).appendMessage("assistant", "done").then(() => "appended", (e: Error) => e.message);

    // Assert
    deepStrictEqual([outcome, operationsOf(tools.inputsOf("sessionStore"))], [
      "tools.sessionStore failed: session buffer locked", ["append_message"],
    ]);
  });

  it("rethrows the failed append of a blank role without rewriting the buffer", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionStore = storeWithoutAppend;

    // Act
    const outcome = await createSessionStore(tools).appendMessage(" ", "done").then(() => "appended", (e: Error) => e.message);

    // Assert
    deepStrictEqual([outcome, operationsOf(tools.inputsOf("sessionStore"))], [
      "tools.sessionStore failed: (no error message provided)", ["append_message"],
    ]);
  });
});

describe("createSessionStore — budget", () => {
  for (const c of BUDGETS) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.tokenBudget = c.reply;

      // Act
      const budget = await createSessionStore(tools).readBudget();

      // Assert
      deepStrictEqual(budget, c.expected);
    });
  }
});

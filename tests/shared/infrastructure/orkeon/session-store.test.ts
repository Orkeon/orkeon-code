// The SessionStore adapter over FakeTools session_store / token_budget, in both
// casings the runtime hands back. Run:
//   node --test tests/shared/infrastructure/orkeon/session-store.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createSessionStore } from "../../../../src/shared/infrastructure/orkeon/session-store.ts";
import { compactSession } from "../../../../src/shared/application/compaction/compact-session.ts";
import { FakeTools } from "../../../support/doubles/fake-tools.ts";
import { BUDGETS, FORCES, NOT_A_LIST, RESET_COUNTS, compactionDeps } from "./session-store.fixtures.ts";

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

  it("snips to the retained exchanges and reads both counts", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.sessionSnip = { RemovedCount: 12, RetainedCount: 7 };

    // Act
    const counts = await createSessionStore(tools).snip(3);

    // Assert
    deepStrictEqual(counts, { removed: 12, retained: 7 });
    deepStrictEqual(tools.inputsOf("sessionSnip"), [{ retain_count: 3 }]);
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

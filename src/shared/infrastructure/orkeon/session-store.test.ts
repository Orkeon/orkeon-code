// The SessionStore adapter over FakeTools session_store / token_budget, in both
// casings the runtime hands back. Run:
//   node --test src/shared/infrastructure/orkeon/session-store.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { createSessionStore } from "./session-store.ts";
import { compactSession } from "../../application/compaction/compact-session.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeMemoryStore } from "../../../../tests/support/fake-memory-store.ts";
import { FakeProgress } from "../../../../tests/support/fake-progress.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";

describe("createSessionStore — messages", () => {
  it("reads `messages` and gives each entry's role and content", async () => {
    const tools = new FakeTools();
    const stored = [{ role: "user", content: "hi", subtype: "x" }, { role: "assistant", content: "hello" }];
    tools.replies.sessionStore = { messages: stored };
    const read = await createSessionStore(tools).readMessages();
    strictEqual(read.stored, stored, "the entries come back as stored, extra fields included");
    deepStrictEqual(read.messages, [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }]);
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "read_messages" }]);
  });

  it("reads `Messages` with PascalCase entries", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStore = { Messages: [{ Role: "user", Content: "hi" }] };
    deepStrictEqual((await createSessionStore(tools).readMessages()).messages, [{ role: "user", content: "hi" }]);
  });

  it("reads an empty buffer when the result has no messages", async () => {
    const read = await createSessionStore(new FakeTools()).readMessages();
    deepStrictEqual(read, { stored: [], messages: [] });
  });

  it("reads a buffer that is not a list as empty, so the compaction skips it rather than failing", async () => {
    for (const messages of [{ role: "user" }, "hi", 3, null]) {
      const tools = new FakeTools();
      tools.replies.sessionStore = { messages };
      const session = createSessionStore(tools);
      deepStrictEqual(await session.readMessages(), { stored: [], messages: [] });
      const deps = {
        session, progress: new FakeProgress(), files: new FakeFiles(), memory: new FakeMemoryStore(),
        llm: new FakeLlm(), log: new FakeLogger(),
      };
      for (const force of [false, true]) {
        deepStrictEqual(await compactSession({ force }, deps), { status: "skipped", reason: "buffer too small" });
      }
    }
  });

  it("writes the buffer as given", async () => {
    const tools = new FakeTools();
    const buffer = [{ role: "system", content: "[compacted]" }];
    await createSessionStore(tools).writeMessages(buffer);
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "write_messages", messages: buffer }]);
  });
});

describe("createSessionStore — reset, snip and title", () => {
  it("resets the buffer and reads the removed count, in any casing", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStore = { removed_count: 4 };
    strictEqual(await createSessionStore(tools).reset(), 4);
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "reset" }]);
    tools.replies.sessionStore = { RemovedCount: 2 };
    strictEqual(await createSessionStore(tools).reset(), 2);
    tools.replies.sessionStore = {};
    strictEqual(await createSessionStore(tools).reset(), 0);
  });

  it("snips to the retained exchanges and reads both counts", async () => {
    const tools = new FakeTools();
    tools.replies.sessionSnip = { RemovedCount: 12, RetainedCount: 7 };
    deepStrictEqual(await createSessionStore(tools).snip(3), { removed: 12, retained: 7 });
    deepStrictEqual(tools.inputsOf("sessionSnip"), [{ retain_count: 3 }]);
    tools.replies.sessionSnip = { removed_count: 1 };
    deepStrictEqual(await createSessionStore(tools).snip(5), { removed: 1, retained: 0 });
  });

  it("sets the title", async () => {
    const tools = new FakeTools();
    await createSessionStore(tools).setTitle("parser fix");
    deepStrictEqual(tools.inputsOf("sessionStore"), [{ operation: "set_title", title: "parser fix" }]);
  });
});

describe("createSessionStore — state", () => {
  it("reads `value` and `Value` as strings", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStore = { value: "plan" };
    strictEqual(await createSessionStore(tools).readState("k"), "plan");
    tools.replies.sessionStore = { Value: 3 };
    strictEqual(await createSessionStore(tools).readState("k"), "3");
    deepStrictEqual(tools.inputsOf("sessionStore")[0], { operation: "get_state", key: "k" });
  });

  it("reads null for an unset key", async () => {
    const tools = new FakeTools();
    tools.replies.sessionStore = { success: true, value: null };
    strictEqual(await createSessionStore(tools).readState("k"), null);
  });

  it("writes a value, and null to remove it", async () => {
    const tools = new FakeTools();
    const store = createSessionStore(tools);
    await store.writeState("k", "v");
    await store.writeState("k", null);
    deepStrictEqual(tools.inputsOf("sessionStore"), [
      { operation: "set_state", key: "k", value: "v" },
      { operation: "set_state", key: "k", value: null },
    ]);
  });
});

describe("createSessionStore — budget", () => {
  it("reads the snake_case and camelCase budgets", async () => {
    const tools = new FakeTools();
    tools.replies.tokenBudget = { used_tokens: 1200, context_window_tokens: 8000 };
    deepStrictEqual(await createSessionStore(tools).readBudget(), { used: 1200, window: 8000 });
    tools.replies.tokenBudget = { usedTokens: 5, contextWindowTokens: 10 };
    deepStrictEqual(await createSessionStore(tools).readBudget(), { used: 5, window: 10 });
  });

  it("reads the counts as numbers, as /context shows them", async () => {
    const tools = new FakeTools();
    tools.replies.tokenBudget = { used_tokens: "500", context_window_tokens: "2000" };
    deepStrictEqual(await createSessionStore(tools).readBudget(), { used: 500, window: 2000 });
  });

  it("reads zeros from an empty budget", async () => {
    deepStrictEqual(await createSessionStore(new FakeTools()).readBudget(), { used: 0, window: 0 });
  });
});

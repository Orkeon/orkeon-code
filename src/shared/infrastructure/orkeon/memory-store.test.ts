// The MemoryStore adapter over a FakeTools memory_store. Run:
//   node --test src/shared/infrastructure/orkeon/memory-store.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createMemoryStore } from "./memory-store.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";
import { ADDED_IDS, GETS_WITHOUT_ENTRY } from "./memory-store.fixtures.ts";

describe("createMemoryStore — list", () => {
  it("lists a category's entries", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.memoryStore = { entries: [{ id: 1, category: "project", content: "uses pnpm" }] };

    // Act
    const entries = await createMemoryStore(tools).list("project");

    // Assert
    deepStrictEqual(entries, [{ id: 1, category: "project", content: "uses pnpm" }]);
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "list", category: "project" }]);
  });

  it("lists every category when none is named", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createMemoryStore(tools).list();

    // Assert
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "list", category: undefined }]);
  });

  it("reads PascalCase entries, a missing content as empty", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.memoryStore = { Entries: [{ Content: "prefers tabs" }, { Id: 2, Category: "user" }] };

    // Act
    const entries = await createMemoryStore(tools).list("user");

    // Assert
    deepStrictEqual(entries, [
      { id: undefined, category: undefined, content: "prefers tabs" },
      { id: 2, category: "user", content: "" },
    ]);
  });

  it("lists nothing when the result has no entries", async () => {
    // Arrange
    const store = createMemoryStore(new FakeTools());

    // Act
    const entries = await store.list("feedback");

    // Assert
    deepStrictEqual(entries, []);
  });

  it("lets a failed call throw", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.memoryStore = new Error("category unavailable");

    // Act
    const act = createMemoryStore(tools).list("reference");

    // Assert
    await rejects(act, /category unavailable/);
  });
});

describe("createMemoryStore — add, get, remove", () => {
  it("adds an entry and reads back its id as text", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.memoryStore = { id: 7 };

    // Act
    const id = await createMemoryStore(tools).add("feedback", "be terse");

    // Assert
    strictEqual(id, "7");
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "add", category: "feedback", content: "be terse" }]);
  });

  for (const c of ADDED_IDS) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.memoryStore = c.reply;

      // Act
      const id = await createMemoryStore(tools).add("reference", "x");

      // Assert
      strictEqual(id, c.id);
    });
  }

  it("gets the entry as reported", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.memoryStore = { Entry: { Id: 3, Content: "x" } };

    // Act
    const entry = await createMemoryStore(tools).get(3);

    // Assert
    deepStrictEqual(entry, { Id: 3, Content: "x" });
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "get", id: 3 }]);
  });

  for (const c of GETS_WITHOUT_ENTRY) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.memoryStore = c.reply;

      // Act
      const entry = await createMemoryStore(tools).get(c.id);

      // Assert
      strictEqual(entry, c.expected);
    });
  }

  it("removes an entry and reports the host's success", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.memoryStore = { Success: true };

    // Act
    const removed = await createMemoryStore(tools).remove(3);

    // Assert
    strictEqual(removed, true);
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "delete", id: 3 }]);
  });

  it("reports a removal the host says failed", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.memoryStore = { success: false };

    // Act
    const removed = await createMemoryStore(tools).remove(3);

    // Assert
    strictEqual(removed, false);
  });
});

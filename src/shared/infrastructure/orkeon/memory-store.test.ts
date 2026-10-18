// The MemoryStore adapter over a FakeTools memory_store. Run:
//   node --test src/shared/infrastructure/orkeon/memory-store.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createMemoryStore } from "./memory-store.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";

describe("createMemoryStore — list", () => {
  it("lists a category's entries", async () => {
    const tools = new FakeTools();
    tools.replies.memoryStore = { entries: [{ id: 1, category: "project", content: "uses pnpm" }] };
    deepStrictEqual(await createMemoryStore(tools).list("project"), [{ id: 1, category: "project", content: "uses pnpm" }]);
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "list", category: "project" }]);
  });

  it("lists every category when none is named", async () => {
    const tools = new FakeTools();
    await createMemoryStore(tools).list();
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "list", category: undefined }]);
  });

  it("reads PascalCase entries, a missing content as empty", async () => {
    const tools = new FakeTools();
    tools.replies.memoryStore = { Entries: [{ Content: "prefers tabs" }, { Id: 2, Category: "user" }] };
    deepStrictEqual(await createMemoryStore(tools).list("user"), [
      { id: undefined, category: undefined, content: "prefers tabs" },
      { id: 2, category: "user", content: "" },
    ]);
  });

  it("lists nothing when the result has no entries", async () => {
    deepStrictEqual(await createMemoryStore(new FakeTools()).list("feedback"), []);
  });

  it("lets a failed call throw", async () => {
    const tools = new FakeTools();
    tools.replies.memoryStore = new Error("category unavailable");
    await rejects(createMemoryStore(tools).list("reference"), /category unavailable/);
  });
});

describe("createMemoryStore — add, get, remove", () => {
  it("adds an entry and reads back its id as text, in either casing", async () => {
    const tools = new FakeTools();
    tools.replies.memoryStore = { id: 7 };
    strictEqual(await createMemoryStore(tools).add("feedback", "be terse"), "7");
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "add", category: "feedback", content: "be terse" }]);
    tools.replies.memoryStore = { Id: 8 };
    strictEqual(await createMemoryStore(tools).add("user", "x"), "8");
  });

  it("reads an id the host reports as null, or not at all, as /memory add prints it", async () => {
    const tools = new FakeTools();
    tools.replies.memoryStore = { id: null };
    strictEqual(await createMemoryStore(tools).add("reference", "x"), "null");
    tools.replies.memoryStore = {};
    strictEqual(await createMemoryStore(tools).add("reference", "x"), "undefined");
    tools.replies.memoryStore = { id: "m-12" };
    strictEqual(await createMemoryStore(tools).add("reference", "x"), "m-12");
  });

  it("gets the entry as reported, else the host's error", async () => {
    const tools = new FakeTools();
    tools.replies.memoryStore = { Entry: { Id: 3, Content: "x" } };
    deepStrictEqual(await createMemoryStore(tools).get(3), { Id: 3, Content: "x" });
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "get", id: 3 }]);
    tools.replies.memoryStore = { error: "no entry 4" };
    strictEqual(await createMemoryStore(tools).get(4), "no entry 4");
    tools.replies.memoryStore = {};
    strictEqual(await createMemoryStore(tools).get(5), undefined);
  });

  it("removes an entry and reports the host's success", async () => {
    const tools = new FakeTools();
    tools.replies.memoryStore = { Success: true };
    strictEqual(await createMemoryStore(tools).remove(3), true);
    deepStrictEqual(tools.inputsOf("memoryStore"), [{ operation: "delete", id: 3 }]);
    tools.replies.memoryStore = { success: false };
    strictEqual(await createMemoryStore(tools).remove(3), false);
  });
});

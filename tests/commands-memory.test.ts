// /memory (commands/_lib/memory.ts) over FakeMemoryStore: list, add, delete and
// get, and the usage line of an empty add. Run:
//   node --test tests/commands-memory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { runMemory } from "../src/commands/_lib/memory.ts";
import { FakeMemoryStore } from "./support/fake-memory-store.ts";

function setup() {
  const memory = new FakeMemoryStore();
  const run = (...tokens: string[]) => runMemory(tokens, { memory });
  return { memory, run };
}

describe("/memory list", () => {
  it("tables every entry (the default sub-command), or one category", async () => {
    const { memory, run } = setup();
    await memory.add("user", "prefers tabs");
    await memory.add("project", "uses pnpm");
    deepStrictEqual(await run(), {
      table: [
        { id: 1, category: "user", content: "prefers tabs" },
        { id: 2, category: "project", content: "uses pnpm" },
      ],
    });
    deepStrictEqual(await run("list", "PROJECT"), { table: [{ id: 2, category: "project", content: "uses pnpm" }] });
  });

  it("says when there is nothing", async () => {
    deepStrictEqual(await setup().run("list"), { text: "(no memories)" });
  });
});

describe("/memory add", () => {
  it("adds to the named category, else to user, and gives the id", async () => {
    const { memory, run } = setup();
    deepStrictEqual(await run("add", "project", "uses", "pnpm"), { text: "added memory #1" });
    deepStrictEqual(await run("add", "prefers", "tabs"), { text: "added memory #2" });
    deepStrictEqual(memory.records, [
      { id: 1, category: "project", content: "uses pnpm" },
      { id: 2, category: "user", content: "prefers tabs" },
    ]);
  });

  it("asks for content", async () => {
    const { memory, run } = setup();
    deepStrictEqual(await run("add", "feedback"), { text: "usage: /memory add <category> <content>" });
    deepStrictEqual(memory.records, []);
  });
});

describe("/memory delete and get", () => {
  it("deletes an entry, and says when there is none", async () => {
    const { memory, run } = setup();
    await memory.add("user", "x");
    deepStrictEqual(await run("delete", "1"), { text: "deleted #1" });
    deepStrictEqual(await run("delete", "1"), { text: "not found: #1" });
  });

  it("prints an entry as the store reports it, and 'not found' otherwise", async () => {
    const { memory, run } = setup();
    await memory.add("user", "x");
    deepStrictEqual(await run("get", "1"), { text: JSON.stringify({ id: 1, category: "user", content: "x" }) });
    deepStrictEqual(await run("get", "9"), { text: "\"not found\"" });
  });
});

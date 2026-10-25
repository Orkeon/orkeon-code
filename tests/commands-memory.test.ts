// /memory (commands/_lib/memory.ts) over FakeMemoryStore: list, add, delete and
// get, and the usage line of an empty add. Run:
//   node --test tests/commands-memory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { runMemory } from "../src/commands/_lib/memory.ts";
import { memoryWith, PREFERS_TABS, USES_PNPM } from "./commands-memory.fixtures.ts";

describe("/memory list", () => {
  it("tables every entry (the default sub-command)", async () => {
    // Arrange
    const memory = memoryWith([PREFERS_TABS, USES_PNPM]);

    // Act
    const view = await runMemory([], { memory });

    // Assert
    deepStrictEqual(view, {
      table: [
        { id: 1, category: "user", content: "prefers tabs" },
        { id: 2, category: "project", content: "uses pnpm" },
      ],
    });
  });

  it("tables one category, named in any case", async () => {
    // Arrange
    const memory = memoryWith([PREFERS_TABS, USES_PNPM]);

    // Act
    const view = await runMemory(["list", "PROJECT"], { memory });

    // Assert
    deepStrictEqual(view, { table: [{ id: 2, category: "project", content: "uses pnpm" }] });
  });

  it("says when there is nothing", async () => {
    // Arrange
    const memory = memoryWith();

    // Act
    const view = await runMemory(["list"], { memory });

    // Assert
    deepStrictEqual(view, { text: "(no memories)" });
  });
});

describe("/memory add", () => {
  it("adds to the named category and gives the id", async () => {
    // Arrange
    const memory = memoryWith();

    // Act
    const view = await runMemory(["add", "project", "uses", "pnpm"], { memory });

    // Assert
    deepStrictEqual(view, { text: "added memory #1" });
    deepStrictEqual(memory.records, [{ id: 1, category: "project", content: "uses pnpm" }]);
  });

  it("adds to user when no category is named, and gives the id", async () => {
    // Arrange
    const memory = memoryWith([{ id: 1, category: "project", content: "uses pnpm" }]);

    // Act
    const view = await runMemory(["add", "prefers", "tabs"], { memory });

    // Assert
    deepStrictEqual(view, { text: "added memory #2" });
    deepStrictEqual(memory.records, [
      { id: 1, category: "project", content: "uses pnpm" },
      { id: 2, category: "user", content: "prefers tabs" },
    ]);
  });

  it("asks for content", async () => {
    // Arrange
    const memory = memoryWith();

    // Act
    const view = await runMemory(["add", "feedback"], { memory });

    // Assert
    deepStrictEqual(view, { text: "usage: /memory add <category> <content>" });
    deepStrictEqual(memory.records, []);
  });
});

describe("/memory delete and get", () => {
  it("deletes an entry", async () => {
    // Arrange
    const memory = memoryWith([{ id: 1, category: "user", content: "x" }]);

    // Act
    const view = await runMemory(["delete", "1"], { memory });

    // Assert
    deepStrictEqual(view, { text: "deleted #1" });
  });

  it("says when there is no entry to delete", async () => {
    // Arrange
    const memory = memoryWith();

    // Act
    const view = await runMemory(["delete", "1"], { memory });

    // Assert
    deepStrictEqual(view, { text: "not found: #1" });
  });

  it("prints an entry as the store reports it", async () => {
    // Arrange
    const memory = memoryWith([{ id: 1, category: "user", content: "x" }]);

    // Act
    const view = await runMemory(["get", "1"], { memory });

    // Assert
    deepStrictEqual(view, { text: JSON.stringify({ id: 1, category: "user", content: "x" }) });
  });

  it("prints 'not found' for an entry the store does not hold", async () => {
    // Arrange
    const memory = memoryWith([{ id: 1, category: "user", content: "x" }]);

    // Act
    const view = await runMemory(["get", "9"], { memory });

    // Assert
    deepStrictEqual(view, { text: "\"not found\"" });
  });
});

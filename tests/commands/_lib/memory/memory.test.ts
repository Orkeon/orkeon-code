// /memory (commands/_lib/memory/memory.ts) over FakeMemoryStore: list, add, delete and
// get, the usage line of an empty add, the /feedback alias and the route of an admission. Run:
//   node --test tests/commands/_lib/memory/memory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { admitTokens, runMemory } from "../../../../src/commands/_lib/memory/memory.ts";
import { ADMIT_TOKEN_CASES, FEEDBACK_RECORDED, FEEDBACK_USAGE, memoryWith, PREFERS_TABS, USES_PNPM } from "./memory.fixtures.ts";

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

describe("/feedback — runMemory typed by its alias", () => {
  it("adds the text as a feedback memory and says the agent replays it", async () => {
    // Arrange
    const memory = memoryWith();

    // Act
    const view = await runMemory(["keep", "answers", "short"], { memory }, "feedback");

    // Assert
    deepStrictEqual(view, { text: FEEDBACK_RECORDED });
    deepStrictEqual(memory.records, [{ id: 1, category: "feedback", content: "keep answers short" }]);
  });

  it("gives its usage line and adds nothing when the text is empty", async () => {
    // Arrange
    const memory = memoryWith();

    // Act
    const view = await runMemory([], { memory }, "feedback");

    // Assert
    deepStrictEqual(view, { text: FEEDBACK_USAGE });
    deepStrictEqual(memory.records, []);
  });
});

describe("admitTokens — the admission's route", () => {
  for (const c of ADMIT_TOKEN_CASES) {
    it(c.name, () => {
      // Arrange
      const tokens = c.tokens;

      // Act
      const admit = admitTokens(tokens, c.typed);

      // Assert
      deepStrictEqual(admit, c.expected);
    });
  }
});

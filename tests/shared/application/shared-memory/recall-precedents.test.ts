// recallEntries and recallPrecedents over FakeSharedMemory and FakeFiles (M-3). Run:
//   node --test tests/shared/application/shared-memory/recall-precedents.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { recallEntries, recallPrecedents } from "../../../../src/shared/application/shared-memory/recall-precedents.ts";
import { entryText, sampleEntry } from "../../../support/fixtures/memory-entries.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { layout, memorySettings, pathOf, setup, sevenMethods } from "./recall-precedents.fixtures.ts";

describe("recallEntries", () => {
  it("asks the project's collection for twenty hits and keeps the admitted entries, best first", async () => {
    // Arrange
    const a = sampleEntry("method", "a");
    const b = sampleEntry("decision", "b");
    const { memory, files } = setup([[a, 0.9], [b, 0.5]]);

    // Act
    const recall = await recallEntries({ memory, files }, { memory: memorySettings, query: " money " });

    // Assert
    deepStrictEqual(recall.precedents.map((p) => p.entry.id), [a.id, b.id]);
    strictEqual(recall.precedents[0].path, pathOf(a));
    strictEqual(recall.truncated, false);
    deepStrictEqual(memory.searches, [{ collection: "memory-shop", query: "money", topN: 20 }]);
  });

  it("drops candidates, superseded entries, other types, files outside entries/ and unreadable files", async () => {
    // Arrange
    const kept = sampleEntry("mistake", "kept");
    const superseded = sampleEntry("mistake", "old", { status: "superseded", supersededBy: kept.id });
    const candidate = sampleEntry("mistake", "cand", { status: "candidate" });
    const method = sampleEntry("method", "other");
    const { memory, files } = setup([[superseded, 0.99], [candidate, 0.98], [method, 0.97], [kept, 0.5]]);
    memory.hits.unshift({ sourceId: `${layout.candidates}/x.md`, score: 1 }, { sourceId: `${layout.entries}/method/gone.md`, score: 1 });
    files.files.set(`${layout.candidates}/x.md`, entryText(sampleEntry("mistake", "x")));

    // Act
    const recall = await recallEntries({ memory, files }, { memory: memorySettings, query: "q", types: ["mistake"] });

    // Assert
    deepStrictEqual(recall.precedents.map((p) => p.entry.id), [kept.id]);
  });

  it("keeps max entries, and says it cut", async () => {
    // Arrange
    const { memory, files } = setup(sevenMethods());

    // Act
    const three = await recallEntries({ memory, files }, { memory: memorySettings, query: "q", max: 3 });

    // Assert
    strictEqual(three.precedents.length, 3);
    strictEqual(three.truncated, true);
  });

  it("keeps five entries at most, whatever max asks", async () => {
    // Arrange
    const { memory, files } = setup(sevenMethods());

    // Act
    const recall = await recallEntries({ memory, files }, { memory: memorySettings, query: "q", max: 50 });

    // Assert
    strictEqual(recall.precedents.length, 5);
  });

  it("asks nothing for a blank query", async () => {
    // Arrange
    const { memory, files } = setup([]);

    // Act
    const recall = await recallEntries({ memory, files }, { memory: memorySettings, query: "  " });

    // Assert
    deepStrictEqual(recall, { precedents: [], truncated: false });
    strictEqual(memory.searches.length, 0);
  });
});

describe("recallPrecedents", () => {
  it("renders the block of what it recalled", async () => {
    // Arrange
    const { memory, files } = setup([[sampleEntry("method", "a"), 0.9]]);

    // Act
    const block = await recallPrecedents({ memory, files, log: new FakeLogger() }, { memory: memorySettings, query: "q" });

    // Assert
    ok(block.startsWith("## Precedents"), block);
    ok(block.includes("shop-method-20261022-a"), block);
  });

  it("is empty and silent when nothing matches", async () => {
    // Arrange
    const { memory, files } = setup([]);
    const log = new FakeLogger();

    // Act
    const block = await recallPrecedents({ memory, files, log }, { memory: memorySettings, query: "q" });

    // Assert
    strictEqual(block, "");
    deepStrictEqual(log.lines, []);
  });

  it("is empty, with one warning, when the index fails", async () => {
    // Arrange
    const { memory, files } = setup([]);
    const log = new FakeLogger();
    memory.searchFailure = new Error("RAG subsystem not registered\nstack");

    // Act
    const block = await recallPrecedents({ memory, files, log }, { memory: memorySettings, query: "q" });

    // Assert
    strictEqual(block, "");
    deepStrictEqual(log.lines, ["warn: shared memory: recall failed, no precedents (RAG subsystem not registered)"]);
  });
});

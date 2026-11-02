// Pre-compaction memory extraction over FakeLlm and FakeMemoryStore. Run:
//   node --test tests/shared/application/compaction/extract-memories.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { extractMemories } from "../../../../src/shared/application/compaction/extract-memories.ts";
import { MEMORY_EXTRACTION_SCHEMA, buildMemoryExtractionPrompt } from "../../../../src/shared/domain/compaction.ts";
import {
  CROSS_CATEGORY_FACT, REFERENCE_AND_PROJECT, REPLACING_FACT, STALE_ENTRY, TWO_FACTS, TWO_FACTS_KEPT, UNKNOWN_OR_EMPTY, memoriesSetup, storeWithStaleEntry,
} from "./extract-memories.fixtures.ts";

describe("extractMemories", () => {
  it("asks the model with the extraction prompt and schema, and writes each durable fact to the store", async () => {
    // Arrange
    const { llm, memory } = memoriesSetup(TWO_FACTS);

    // Act
    const items = await extractMemories(llm, memory, "TRANSCRIPT");

    // Assert
    deepStrictEqual(llm.extracts, [{ prompt: buildMemoryExtractionPrompt("TRANSCRIPT"), schema: MEMORY_EXTRACTION_SCHEMA }]);
    deepStrictEqual(items, TWO_FACTS_KEPT);
    deepStrictEqual(memory.records.map((r) => [r.category, r.content]), [
      ["project", "uses pnpm workspaces"],
      ["user", "prefers terse answers"],
    ]);
  });

  it("gives the model today's date when the caller passes it", async () => {
    // Arrange
    const { llm, memory } = memoriesSetup(TWO_FACTS);

    // Act
    await extractMemories(llm, memory, "T", "2026-10-24");

    // Assert
    deepStrictEqual(llm.extracts.map((c) => c.prompt), [buildMemoryExtractionPrompt("T", [], "2026-10-24")]);
  });

  it("lists the known entries by id in the prompt", async () => {
    // Arrange
    const { llm, memory } = storeWithStaleEntry(REPLACING_FACT);

    // Act
    await extractMemories(llm, memory, "T");

    // Assert
    deepStrictEqual(llm.extracts.map((c) => c.prompt), [
      buildMemoryExtractionPrompt("T", [STALE_ENTRY]),
    ]);
  });

  it("lists the known entries newest first, so the capped list keeps the most recent", async () => {
    // Arrange
    const { llm, memory } = storeWithStaleEntry(REPLACING_FACT);

    // Act
    await extractMemories(llm, memory, "T");

    // Assert
    deepStrictEqual(memory.listedNewestFirst, [true]);
  });

  it("replaces the known entry a new fact makes out of date, in place", async () => {
    // Arrange
    const { llm, memory } = storeWithStaleEntry(REPLACING_FACT);

    // Act
    await extractMemories(llm, memory, "T");

    // Assert
    deepStrictEqual(memory.records, [{ id: 1, category: "project", content: "uses pnpm 9" }]);
  });

  it("adds a fact that names a known entry of another category as a new entry, the known one kept", async () => {
    // Arrange
    const { llm, memory } = storeWithStaleEntry(CROSS_CATEGORY_FACT);

    // Act
    await extractMemories(llm, memory, "T");

    // Assert
    deepStrictEqual(memory.records, [
      { ...STALE_ENTRY },
      { id: 2, category: "user", content: "prefers pnpm 9" },
    ]);
  });

  it("adds the fact as a new entry when the store refuses the replacement", async () => {
    // Arrange
    const { llm, memory } = storeWithStaleEntry(REPLACING_FACT);
    memory.refusesReplace = true;

    // Act
    await extractMemories(llm, memory, "T");

    // Assert
    deepStrictEqual(memory.records, [
      { ...STALE_ENTRY },
      { id: 2, category: "project", content: "uses pnpm 9" },
    ]);
  });

  it("drops an item without a known category or content", async () => {
    // Arrange
    const { llm, memory } = memoriesSetup(UNKNOWN_OR_EMPTY);

    // Act
    const items = await extractMemories(llm, memory, "T");

    // Assert
    deepStrictEqual(items, []);
    strictEqual(memory.records.length, 0);
  });

  it("keeps a fact the store refused: it still reaches the recap", async () => {
    // Arrange
    const { llm, memory } = memoriesSetup(REFERENCE_AND_PROJECT);
    memory.failing.add("reference");

    // Act
    const items = await extractMemories(llm, memory, "T");

    // Assert
    deepStrictEqual(items.map((it) => it.category), ["reference", "project"]);
    deepStrictEqual(memory.records.map((r) => r.category), ["project"]);
  });

  it("degrades to no memory when the model's answer does not parse", async () => {
    // Arrange
    const { llm, memory } = memoriesSetup(new Error("not JSON"));

    // Act
    const items = await extractMemories(llm, memory, "T");

    // Assert
    deepStrictEqual(items, []);
    strictEqual(memory.records.length, 0);
  });
});

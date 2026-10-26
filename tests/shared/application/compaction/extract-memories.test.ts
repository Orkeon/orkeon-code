// Pre-compaction memory extraction over FakeLlm and FakeMemoryStore. Run:
//   node --test tests/shared/application/compaction/extract-memories.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { extractMemories } from "../../../../src/shared/application/compaction/extract-memories.ts";
import { MEMORY_EXTRACTION_SCHEMA, buildMemoryExtractionPrompt } from "../../../../src/shared/domain/compaction.ts";
import { REFERENCE_AND_PROJECT, TWO_FACTS, TWO_FACTS_KEPT, UNKNOWN_OR_EMPTY, memoriesSetup } from "./extract-memories.fixtures.ts";

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

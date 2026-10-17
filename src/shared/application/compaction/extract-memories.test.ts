// Pre-compaction memory extraction over FakeLlm and FakeMemoryStore. Run:
//   node_modules/.bin/tsx --test shared/application/compaction/extract-memories.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { extractMemories } from "./extract-memories.ts";
import { MEMORY_EXTRACTION_SCHEMA, buildMemoryExtractionPrompt } from "../../domain/compaction.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeMemoryStore } from "../../../../tests/support/fake-memory-store.ts";

function setup(extraction: unknown) {
  const llm = new FakeLlm();
  llm.extractions = [extraction];
  return { llm, memory: new FakeMemoryStore() };
}

describe("extractMemories", () => {
  it("asks the model with the extraction prompt and schema, and writes each durable fact to the store", async () => {
    const { llm, memory } = setup({
      items: [
        { category: "project", content: "uses pnpm workspaces" },
        { category: "user", content: " prefers terse answers " },
      ],
    });
    const items = await extractMemories(llm, memory, "TRANSCRIPT");
    deepStrictEqual(llm.extracts, [{ prompt: buildMemoryExtractionPrompt("TRANSCRIPT"), schema: MEMORY_EXTRACTION_SCHEMA }]);
    deepStrictEqual(items, [
      { category: "project", content: "uses pnpm workspaces" },
      { category: "user", content: "prefers terse answers" },
    ]);
    deepStrictEqual(memory.records.map((r) => [r.category, r.content]), [
      ["project", "uses pnpm workspaces"],
      ["user", "prefers terse answers"],
    ]);
  });

  it("drops an item without a known category or content", async () => {
    const { llm, memory } = setup({ items: [{ category: "bogus", content: "x" }, { category: "feedback", content: "  " }] });
    deepStrictEqual(await extractMemories(llm, memory, "T"), []);
    strictEqual(memory.records.length, 0);
  });

  it("keeps a fact the store refused: it still reaches the recap", async () => {
    const { llm, memory } = setup({ items: [{ category: "reference", content: "docs at /docs" }, { category: "project", content: "monorepo" }] });
    memory.failing.add("reference");
    deepStrictEqual((await extractMemories(llm, memory, "T")).map((it) => it.category), ["reference", "project"]);
    deepStrictEqual(memory.records.map((r) => r.category), ["project"]);
  });

  it("degrades to no memory when the model's answer does not parse", async () => {
    const { llm, memory } = setup(new Error("not JSON"));
    deepStrictEqual(await extractMemories(llm, memory, "T"), []);
    strictEqual(memory.records.length, 0);
  });
});

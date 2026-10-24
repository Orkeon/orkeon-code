// recallEntries and recallPrecedents over FakeSharedMemory and FakeFiles (M-3). Run:
//   node --test src/shared/application/shared-memory/recall-precedents.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { recallEntries, recallPrecedents } from "./recall-precedents.ts";
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { FakeSharedMemory } from "../../../../tests/doubles/fake-shared-memory.ts";
import { entryText, sampleEntry } from "../../../../tests/doubles/memory-entries.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import type { MemoryEntry } from "../../domain/shared-memory/entry.ts";

const layout = memoryLayout(".orkeon/memory");
const memorySettings = { layout, collection: "memory-shop" };
const pathOf = (e: MemoryEntry) => `${layout.entries}/${e.type}/${e.id}.md`;

function setup(entries: Array<[MemoryEntry, number]>) {
  const memory = new FakeSharedMemory();
  const files = new FakeFiles();
  for (const [entry, score] of entries) {
    files.files.set(pathOf(entry), entryText(entry));
    memory.hits.push({ sourceId: pathOf(entry), score });
  }
  return { memory, files };
}

describe("recallEntries", () => {
  it("asks the project's collection for twelve hits and keeps the admitted entries, best first", async () => {
    const a = sampleEntry("method", "a");
    const b = sampleEntry("decision", "b");
    const { memory, files } = setup([[a, 0.9], [b, 0.5]]);
    const recall = await recallEntries({ memory, files }, { memory: memorySettings, query: " money " });
    deepStrictEqual(recall.precedents.map((p) => p.entry.id), [a.id, b.id]);
    strictEqual(recall.precedents[0].path, pathOf(a));
    strictEqual(recall.truncated, false);
    deepStrictEqual(memory.searches, [{ collection: "memory-shop", query: "money", topN: 12 }]);
  });

  it("drops candidates, superseded entries, other types, files outside entries/ and unreadable files", async () => {
    const kept = sampleEntry("mistake", "kept");
    const superseded = sampleEntry("mistake", "old", { status: "superseded", supersededBy: kept.id });
    const candidate = sampleEntry("mistake", "cand", { status: "candidate" });
    const method = sampleEntry("method", "other");
    const { memory, files } = setup([[superseded, 0.99], [candidate, 0.98], [method, 0.97], [kept, 0.5]]);
    memory.hits.unshift({ sourceId: `${layout.candidates}/x.md`, score: 1 }, { sourceId: `${layout.entries}/method/gone.md`, score: 1 });
    files.files.set(`${layout.candidates}/x.md`, entryText(sampleEntry("mistake", "x")));
    const recall = await recallEntries({ memory, files }, { memory: memorySettings, query: "q", types: ["mistake"] });
    deepStrictEqual(recall.precedents.map((p) => p.entry.id), [kept.id]);
  });

  it("keeps max entries, five at most, and says it cut", async () => {
    const entries = Array.from({ length: 7 }, (_, i): [MemoryEntry, number] => [sampleEntry("method", `m${i}`), 1 - i / 10]);
    const { memory, files } = setup(entries);
    const three = await recallEntries({ memory, files }, { memory: memorySettings, query: "q", max: 3 });
    strictEqual(three.precedents.length, 3);
    strictEqual(three.truncated, true);
    strictEqual((await recallEntries({ memory, files }, { memory: memorySettings, query: "q", max: 50 })).precedents.length, 5);
  });

  it("asks nothing for a blank query", async () => {
    const { memory, files } = setup([]);
    deepStrictEqual(await recallEntries({ memory, files }, { memory: memorySettings, query: "  " }), { precedents: [], truncated: false });
    strictEqual(memory.searches.length, 0);
  });
});

describe("recallPrecedents", () => {
  it("renders the block of what it recalled", async () => {
    const { memory, files } = setup([[sampleEntry("method", "a"), 0.9]]);
    const block = await recallPrecedents({ memory, files, log: new FakeLogger() }, { memory: memorySettings, query: "q" });
    ok(block.startsWith("## Precedents"), block);
    ok(block.includes("shop-method-20261022-a"), block);
  });

  it("is empty, with one warning, when the index fails; empty and silent when nothing matches", async () => {
    const { memory, files } = setup([]);
    const log = new FakeLogger();
    strictEqual(await recallPrecedents({ memory, files, log }, { memory: memorySettings, query: "q" }), "");
    deepStrictEqual(log.lines, []);
    memory.searchFailure = new Error("RAG subsystem not registered\nstack");
    strictEqual(await recallPrecedents({ memory, files, log }, { memory: memorySettings, query: "q" }), "");
    deepStrictEqual(log.lines, ["warn: shared memory: recall failed, no precedents (RAG subsystem not registered)"]);
  });
});

// The SharedMemory adapter over a fake `rag` namespace and fake rag tools (M-3). Run:
//   node --test src/shared/infrastructure/orkeon/shared-memory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";

import { createSharedMemory } from "./shared-memory.ts";
import type { RagApi } from "./shared-memory.ts";

const A = "/workspace/.orkeon/memory/entries/method/x-method-20261024-a.md";
const B = "/workspace/.orkeon/memory/entries/decision/x-decision-20261024-b.md";

function fakeRag(citations: unknown[], report: unknown = {}) {
  const calls: unknown[] = [];
  const rag: RagApi = {
    async retrieve(question, options) { calls.push(["retrieve", question, options]); return { citations }; },
    async ingest(options) { calls.push(["ingest", options]); return report; },
  };
  return { rag, calls };
}

const noTools = {
  ragSearch: async () => { throw new Error("rag_search must not be called"); },
  ragIngest: async () => { throw new Error("rag_ingest must not be called"); },
} as any;

describe("createSharedMemory over rag", () => {
  it("retrieves without generating, one hit per file with its best score, best first", async () => {
    const { rag, calls } = fakeRag([
      { sourceId: A, score: 0.4, chunkId: "1" }, { sourceId: B, score: 0.7, chunkId: "2" }, { sourceId: A, score: 0.9, chunkId: "3" },
      { sourceId: "", score: 1 },
    ]);
    deepStrictEqual(await createSharedMemory(rag, noTools).search("memory-x", "money", 12), [
      { sourceId: A, score: 0.9 }, { sourceId: B, score: 0.7 },
    ]);
    deepStrictEqual(calls, [["retrieve", "money", { collection: "memory-x", topN: 12 }]]);
  });

  it("ingests structurally, prune passed, and reads the report's counters", async () => {
    const { rag, calls } = fakeRag([], {
      sourcesAdded: 2, sourcesReingested: 1, sourcesUnchanged: 5, sourcesPruned: 1, errors: ["one bad file"],
    });
    deepStrictEqual(await createSharedMemory(rag, noTools).ingest("memory-x", ["/workspace/m/entries/**/*.md"], { prune: true }),
      { added: 2, reingested: 1, unchanged: 5, pruned: 1, errors: ["one bad file"] });
    deepStrictEqual(calls, [["ingest", {
      collection: "memory-x", sources: ["/workspace/m/entries/**/*.md"], chunkingStrategy: "structural", prune: true,
    }]]);
  });

  it("lets a failure of the index through: the caller decides", async () => {
    const rag: RagApi = {
      retrieve: async () => { throw new Error("RAG subsystem not registered"); },
      ingest: async () => { throw new Error("RAG subsystem not registered"); },
    };
    await rejects(createSharedMemory(rag, noTools).search("memory-x", "q", 5), /not registered/);
  });
});

describe("createSharedMemory without a rag namespace", () => {
  it("falls back on rag_search and rag_ingest, in their snake_case", async () => {
    const calls: unknown[] = [];
    const tools = {
      ragSearch: async (input: unknown) => {
        calls.push(["rag_search", input]);
        return { answer: "ignored", citations: [{ source_id: A, score: 0.5, chunk_id: "1", marker: 1, start_offset: 0, end_offset: 1 }] };
      },
      ragIngest: async (input: unknown) => { calls.push(["rag_ingest", input]); return { sources_added: 1 }; },
    } as any;
    const memory = createSharedMemory(undefined, tools);
    deepStrictEqual(await memory.search("memory-x", "q", 12), [{ sourceId: A, score: 0.5 }]);
    deepStrictEqual(await memory.ingest("memory-x", [A], { prune: false }), { added: 1, reingested: 0, unchanged: 0, pruned: 0, errors: [] });
    deepStrictEqual(calls, [
      ["rag_search", { collection: "memory-x", question: "q", top_k: 12 }],
      ["rag_ingest", { collection: "memory-x", sources: [A], chunking_strategy: "structural", prune: false }],
    ]);
  });
});

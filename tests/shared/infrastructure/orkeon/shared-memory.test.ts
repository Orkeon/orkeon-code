// The SharedMemory adapter over a fake `rag` namespace and fake rag tools (M-3). Run:
//   node --test tests/shared/infrastructure/orkeon/shared-memory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";

import { createSharedMemory } from "../../../../src/shared/infrastructure/orkeon/shared-memory.ts";
import { A, B, FAILING_RAG, fakeRag, noTools, ragTools } from "./shared-memory.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("createSharedMemory over rag", () => {
  it("retrieves without generating, one hit per file with its best score, best first", async () => {
    // Arrange
    const { rag, calls } = fakeRag([
      { sourceId: A, score: 0.4, chunkId: "1" }, { sourceId: B, score: 0.7, chunkId: "2" }, { sourceId: A, score: 0.9, chunkId: "3" },
      { sourceId: "", score: 1 },
    ]);

    // Act
    const hits = await createSharedMemory(rag, noTools).search("memory-x", "money", 12);

    // Assert
    deepStrictEqual(hits, [{ sourceId: A, score: 0.9 }, { sourceId: B, score: 0.7 }]);
    deepStrictEqual(calls, [["retrieve", "money", { collection: "memory-x", topN: 12 }]]);
  });

  it("ingests structurally, prune passed, and reads the report's counters", async () => {
    // Arrange
    const { rag, calls } = fakeRag([], {
      sourcesAdded: 2, sourcesReingested: 1, sourcesUnchanged: 5, sourcesPruned: 1, errors: ["one bad file"],
    });

    // Act
    const report = await createSharedMemory(rag, noTools).ingest("memory-x", [`${WORKSPACE}/m/entries/**/*.md`], { prune: true });

    // Assert
    deepStrictEqual(report, { added: 2, reingested: 1, unchanged: 5, pruned: 1, errors: ["one bad file"] });
    deepStrictEqual(calls, [["ingest", {
      collection: "memory-x", sources: [`${WORKSPACE}/m/entries/**/*.md`], chunkingStrategy: "structural", prune: true,
    }]]);
  });

  it("lets a failure of the index through: the caller decides", async () => {
    // Arrange
    const memory = createSharedMemory(FAILING_RAG, noTools);

    // Act
    const act = memory.search("memory-x", "q", 5);

    // Assert
    await rejects(act, /not registered/);
  });
});

describe("createSharedMemory without a rag namespace", () => {
  it("falls back on rag_search, in its snake_case", async () => {
    // Arrange
    const { tools, calls } = ragTools();

    // Act
    const hits = await createSharedMemory(undefined, tools).search("memory-x", "q", 12);

    // Assert
    deepStrictEqual(hits, [{ sourceId: A, score: 0.5 }]);
    deepStrictEqual(calls, [["rag_search", { collection: "memory-x", question: "q", top_k: 12 }]]);
  });

  it("falls back on rag_ingest, in its snake_case", async () => {
    // Arrange
    const { tools, calls } = ragTools();

    // Act
    const report = await createSharedMemory(undefined, tools).ingest("memory-x", [A], { prune: false });

    // Assert
    deepStrictEqual(report, { added: 1, reingested: 0, unchanged: 0, pruned: 0, errors: [] });
    deepStrictEqual(calls, [["rag_ingest", { collection: "memory-x", sources: [A], chunking_strategy: "structural", prune: false }]]);
  });
});

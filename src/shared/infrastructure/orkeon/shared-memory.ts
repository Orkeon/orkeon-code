/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// SharedMemory adapter: the RAG index of the shared memory over the runtime's `rag` namespace
// (retrieve: the passages without a generated answer, so no model call; ingest with prune), and
// over the rag_search / rag_ingest tools when the host declares no `rag` namespace. A file the
// index cut into several passages comes back once, with its best score.

import type { SharedHit, SharedIngest, SharedMemory } from "../../application/ports.ts";
import { asArray, pick } from "./tool-results.ts";

/** What this adapter calls of the runtime's `rag` namespace. */
export interface RagApi {
  retrieve(question: string, options: { collection: string; topN?: number }): Promise<{ citations: readonly unknown[] }>;
  ingest(options: {
    collection: string; sources: readonly string[]; chunkingStrategy?: string; prune?: boolean;
  }): Promise<unknown>;
}

/** The entries are cut on their headings (## Context, ## Content, ## Evidence). */
export const MEMORY_CHUNKING = "structural";

function bestPerSource(citations: readonly unknown[]): SharedHit[] {
  const best = new Map<string, number>();
  for (const c of citations) {
    const sourceId = String(pick(c, "sourceId", "source_id", "SourceId") ?? "");
    const score = Number(pick(c, "score", "Score") ?? 0);
    if (sourceId === "") continue;
    if (!best.has(sourceId) || score > (best.get(sourceId) as number)) best.set(sourceId, score);
  }
  return [...best].map(([sourceId, score]) => ({ sourceId, score })).sort((a, b) => b.score - a.score);
}

const count = (report: unknown, ...names: string[]): number => Number(pick(report, ...names) ?? 0);

function ingestOf(report: unknown): SharedIngest {
  return {
    added: count(report, "sourcesAdded", "sources_added", "SourcesAdded"),
    reingested: count(report, "sourcesReingested", "sources_reingested", "SourcesReingested"),
    unchanged: count(report, "sourcesUnchanged", "sources_unchanged", "SourcesUnchanged"),
    pruned: count(report, "sourcesPruned", "sources_pruned", "SourcesPruned"),
    errors: asArray(pick(report, "errors", "Errors")).map(String),
  };
}

export function createSharedMemory(
  rag: RagApi | undefined, tools: Pick<OrkeonTools, "ragSearch" | "ragIngest">,
): SharedMemory {
  return {
    async search(collection, query, topN) {
      const citations = rag !== undefined
        ? (await rag.retrieve(query, { collection, topN })).citations
        : asArray(pick(await tools.ragSearch({ collection, question: query, top_k: topN }), "citations", "Citations"));
      return bestPerSource(citations);
    },
    async ingest(collection, sources, options) {
      const report = rag !== undefined
        ? await rag.ingest({ collection, sources, chunkingStrategy: MEMORY_CHUNKING, prune: options.prune })
        : await tools.ragIngest({ collection, sources: [...sources], chunking_strategy: MEMORY_CHUNKING, prune: options.prune });
      return ingestOf(report);
    },
  };
}

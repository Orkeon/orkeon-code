// The rag namespaces and rag tools the createSharedMemory tests run on, and the files their hits name.
import type { RagApi } from "./shared-memory.ts";

export const A = "/workspace/.orkeon/memory/entries/method/x-method-20261024-a.md";
export const B = "/workspace/.orkeon/memory/entries/decision/x-decision-20261024-b.md";

/** A rag namespace answering `citations` to a retrieve and `report` to an ingest, each call recorded. */
export function fakeRag(citations: unknown[], report: unknown = {}) {
  const calls: unknown[] = [];
  const rag: RagApi = {
    async retrieve(question, options) { calls.push(["retrieve", question, options]); return { citations }; },
    async ingest(options) { calls.push(["ingest", options]); return report; },
  };
  return { rag, calls };
}

/** A rag namespace whose index is not registered: every call fails. */
export const FAILING_RAG: RagApi = {
  retrieve: async () => { throw new Error("RAG subsystem not registered"); },
  ingest: async () => { throw new Error("RAG subsystem not registered"); },
};

/** rag tools that must stay unused while a rag namespace is there. */
export const noTools = {
  ragSearch: async () => { throw new Error("rag_search must not be called"); },
  ragIngest: async () => { throw new Error("rag_ingest must not be called"); },
} as any;

/** The rag_search and rag_ingest tools, in their snake_case, each call recorded. */
export function ragTools() {
  const calls: unknown[] = [];
  const tools = {
    ragSearch: async (input: unknown) => {
      calls.push(["rag_search", input]);
      return { answer: "ignored", citations: [{ source_id: A, score: 0.5, chunk_id: "1", marker: 1, start_offset: 0, end_offset: 1 }] };
    },
    ragIngest: async (input: unknown) => { calls.push(["rag_ingest", input]); return { sources_added: 1 }; },
  } as any;
  return { tools, calls };
}

// The shared-memory port: the RAG index of the project's shared memory.
// Types only, re-exported by ../ports.ts.

/** A passage of the shared memory's index: the file it comes from (virtual path) and its score. */
export interface SharedHit {
  sourceId: string;
  score: number;
}

/** What an ingestion of the shared memory's index did, by source. */
export interface SharedIngest {
  added: number;
  reingested: number;
  unchanged: number;
  pruned: number;
  errors: string[];
}

/** The RAG index of the shared memory (one collection per project, `memory-<project>`); its files are read and
 *  written through Files. Each call throws when the host cannot answer it (no RAG subsystem). */
export interface SharedMemory {
  /** The best passages for `query`, one per source file, best first. */
  search(collection: string, query: string, topN: number): Promise<SharedHit[]>;
  /** Index `sources` (virtual paths or globs); `prune` drops the sources of the collection absent from them. */
  ingest(collection: string, sources: readonly string[], options: { prune: boolean }): Promise<SharedIngest>;
}

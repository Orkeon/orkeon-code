// FakeSharedMemory: the SharedMemory port over a list of hits answered to every search (or per
// query in `byQuery`), every search and ingest recorded, and a failure switch for each call, as
// a host without the RAG subsystem throws.
import type { SharedHit, SharedIngest, SharedMemory } from "../../../src/shared/application/ports.ts";

export class FakeSharedMemory implements SharedMemory {
  hits: SharedHit[] = [];
  byQuery = new Map<string, SharedHit[]>();
  searches: Array<{ collection: string; query: string; topN: number }> = [];
  ingests: Array<{ collection: string; sources: string[]; prune: boolean }> = [];
  report: SharedIngest = { added: 0, reingested: 0, unchanged: 0, pruned: 0, errors: [] };
  searchFailure: Error | null = null;
  ingestFailure: Error | null = null;

  async search(collection: string, query: string, topN: number): Promise<SharedHit[]> {
    this.searches.push({ collection, query, topN });
    if (this.searchFailure) throw this.searchFailure;
    return (this.byQuery.get(query) ?? this.hits).slice(0, topN);
  }

  async ingest(collection: string, sources: readonly string[], options: { prune: boolean }): Promise<SharedIngest> {
    this.ingests.push({ collection, sources: [...sources], prune: options.prune });
    if (this.ingestFailure) throw this.ingestFailure;
    return this.report;
  }
}

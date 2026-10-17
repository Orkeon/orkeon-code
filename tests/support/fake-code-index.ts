// FakeCodeIndex: the CodeIndex port answering its fields: `roots` (how many the
// index holds), `indexed` (what index() reports), `maps` per level (an unset level
// is empty), `graph`, and `packages` per fqn (an unknown fqn summarises as empty).
// A `failure` makes every call throw it. Every call lands in `calls` as
// "<method> <arguments>".
import type { CodeIndex, CodeMap } from "../../src/shared/application/ports.ts";
import type {
  GraphSummary, IndexSummary, PackageSummary,
} from "../../src/shared/domain/code-intel-contract.ts";

export class FakeCodeIndex implements CodeIndex {
  roots = 0;
  indexed: IndexSummary = { files: 0, nodes: 0, edges: 0, statements: 0, errors: [] };
  maps: Record<string, CodeMap> = {};
  graph: GraphSummary = { nodes: [], edges: [], nodeCount: 0, edgeCount: 0, cycleCount: 0 };
  packages: Record<string, PackageSummary> = {};
  failure: Error | null = null;
  calls: string[] = [];

  record(call: string): void {
    this.calls.push(call);
    if (this.failure) throw this.failure;
  }

  async rootCount(): Promise<number> {
    this.record("rootCount");
    return this.roots;
  }

  async index(root: string): Promise<IndexSummary> {
    this.record(`index ${root}`);
    return this.indexed;
  }

  async map(level: string, withMetrics: boolean): Promise<CodeMap> {
    this.record(`map ${level} ${withMetrics}`);
    return this.maps[level] ?? { entries: [], symbolCount: 0 };
  }

  async dependencyGraph(scope: string, maxNodes: number): Promise<GraphSummary> {
    this.record(`dependencyGraph ${scope} ${maxNodes}`);
    return this.graph;
  }

  async packageSummary(fqn: string): Promise<PackageSummary> {
    this.record(`packageSummary ${fqn}`);
    return this.packages[fqn] ?? { fqn, name: "", files: 0, symbols: 0, dependencies: [] };
  }
}

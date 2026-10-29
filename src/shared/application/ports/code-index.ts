// The code-index ports: the map, search and graph of the code, its anchors and the access cost.
// Types only, re-exported by ../ports.ts.

import type { AccessCostReport } from "../../domain/dev/access-cost.ts";
import type {
  GraphSummary, ImpactSummary, IndexSummary, MapEntry, PackageSummary,
} from "../../domain/code-intel-contract.ts";

/** One level of the code map: its entries, and the symbol total it reports. */
export interface CodeMap {
  entries: MapEntry[];
  symbolCount: number;
}

/** One hit of the hybrid code search. */
export interface CodeSearchHit {
  /** The symbol, e.g. "/workspace/src/math.ts::add". */
  fqn: string;
  /** A rank aggregate in hybrid mode (about 0.03): an order, not a probability. */
  score: number;
  /** Why the hit ranked: "hybrid", "vector" or "bm25". */
  origin: string;
}

/** Where a symbol lives: the file and the lines the index cites for it. */
export interface SymbolLocation {
  fqn: string;
  /** The file path as the index returns it, e.g. "/workspace/src/math.ts". */
  path: string;
  /** 1-based; 0 when the index reports none. */
  startLine: number;
  endLine: number;
  language: string;
  /** The first non-blank line of the source, trimmed, at most 160 characters. */
  firstLine: string;
}

/** The code index (RaggableTree), as /analyze harvests it and /dev-plan searches it.
 *  Each call throws when the host cannot answer it. */
export interface CodeIndex {
  /** How many roots the index holds; 0 before the first indexing. */
  rootCount(): Promise<number>;
  /** Index `root`, and count what the index then holds. */
  index(root: string): Promise<IndexSummary>;
  /** The map at `level`; `withMetrics` asks for the per-symbol metrics. */
  map(level: string, withMetrics: boolean): Promise<CodeMap>;
  /** The dependency graph of `scope`, at most `maxNodes` nodes, without its mermaid rendering. */
  dependencyGraph(scope: string, maxNodes: number): Promise<GraphSummary>;
  packageSummary(fqn: string): Promise<PackageSummary>;
  /** The hybrid code search: at most `topK` hits, best first. */
  search(query: string, topK: number): Promise<CodeSearchHit[]>;
  /** Where `fqn` lives: its file and lines. Throws when the index has no such symbol. */
  symbolSource(fqn: string): Promise<SymbolLocation>;
  /** The callers of `target`, `maxDepth` levels up. */
  impact(target: string, maxDepth: number): Promise<ImpactSummary>;
}

/** The closure of anchors: the FQNs they contain, and the callers and tests of them and of what
 *  they contain, distinct and sorted; `unresolved` the anchors the index does not know. */
export interface AnchorClosure {
  nodes: string[];
  unresolved: string[];
  truncated: boolean;
}

/** The anchors of the code index (`batch_anchors`), apart from CodeIndex. Throws when the host cannot answer. */
export interface AnchorIndex {
  closure(fqns: readonly string[]): Promise<AnchorClosure>;
}

/** What `dev-verify` asks of the code index for the access cost (`index_status`, `incremental_reindex`,
 *  `access_cost`), apart from CodeIndex. Each call throws when the host cannot answer it. */
export interface CostIndex {
  /** The virtual roots the index holds; none before the first indexing. */
  roots(): Promise<string[]>;
  /** Re-parse `files` (virtual paths) under `root`; the errors the tool reports. */
  refresh(root: string, files: readonly string[]): Promise<string[]>;
  /** The access cost of the members of `files` (virtual paths): the report, or null and the tool's errors. */
  accessCost(files: readonly string[], receivers: string | undefined): Promise<{ report: AccessCostReport | null; errors: string[] }>;
  /** The tests the graph reaches from `files` (paths relative to the indexed root, as git names them: the runtime
   *  looks each up as `<root>/<file>`), by `affected_tests`; absent when it is not wired. */
  affected?(files: readonly string[]): Promise<AffectedTests>;
}

/** What `affected_tests` answers: the test projects and classes reached, `all` when the graph cannot bound them,
 *  and the files it could not resolve. */
export interface AffectedTests { all: boolean; projects: string[]; classes: string[]; unresolved: string[] }

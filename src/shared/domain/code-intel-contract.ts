// B-14 — the VERIFIED request/response contract of the five code-intel tools.
// Pure, no IO.
//
// Every name below was read off a live call on 2026-08-05 (via `/debug-tool-call
// <tool> {json}`, which prints the raw result), not from a doc or a guess. That
// matters more than it sounds: the first draft of the code-intel probe assumed
// `symbol_name` and `direction: "callees"`, and read counts from `files_indexed`.
// All three were wrong —
//   • `symbol_source` takes `fqn`;
//   • `flow_trace.direction` is Forward | Backward | Both, and 'callees' is a
//     typed deserialization failure;
//   • `index_codebase` reports `file_count` / `node_count`, so a reader looking
//     for `files_indexed` gets 0 from a successful index.
// The last one is the dangerous shape: the call SUCCEEDS and the caller reports
// "indexed 0 files", which reads exactly like an empty workspace. A wrong
// parameter name at least throws.
//
// So the readers live here, one per tool, with the field names pinned by tests
// against payloads captured from that live run. If the framework renames a field,
// a test fails instead of a probe quietly reporting zero.

/** The ten tools the main-loop catalogue grants for code intelligence.
 *  The first five were pinned 2026-08-05; the analysis five (dependency_graph,
 *  impact_analysis, package_summary, sub_graph, symbol_detail) were pinned
 *  2026-08-06 from the extended probe's live run on the fixture. */
export const CODE_INTEL_TOOLS = [
  "index_codebase", "codebase_map", "codebase_search", "symbol_source", "flow_trace",
  "dependency_graph", "impact_analysis", "package_summary", "sub_graph", "symbol_detail",
] as const;

// ── Hybrid search + lazy freshness (captured live 2026-08-05, post-hybrid) ──
//
// codebase_search gained three surfaces, all read off live calls:
//  - request `mode`: "Hybrid" (default) | "Vector" | "Lexical";
//  - hit `match_origin`: "hybrid" | "vector" | "bm25" — WHY a hit ranked (an exact
//    identifier reads hybrid/bm25; scores are RRF rank aggregates in hybrid mode,
//    ~0.03 scale, NOT cosine);
//  - response `refreshed_files`: how many edited files the lazy freshness pass
//    reindexed BEFORE answering. Non-zero right after the agent's own edits.
// And rag_search takes `question` — NOT `query`. Session-4/5 lesson, third
// occurrence: the probe caught `{"query": ...} → "question parameter is required"`
// before any wiring shipped the wrong name.

/** `codebase_search.mode` vocabulary (the C# SearchMode enum, PascalCase). */
export const SEARCH_MODES = ["Hybrid", "Vector", "Lexical"] as const;

/** Hit origins the hybrid search reports. */
export const MATCH_ORIGINS = ["hybrid", "vector", "bm25"] as const;

/** `rag_search` request parameter names (verified live). */
export const RAG_SEARCH_PARAMS = ["question", "collection", "top_n"] as const;

/** The collection routing rag_search to the code index. */
export const RAG_RAGGABLE_TREE_COLLECTION = "raggable-tree";

/** Hit origin of one search hit; unknown/absent → "vector" (the pre-hybrid reading). */
export function readMatchOrigin(hit: any): string {
  const v = String(hit?.match_origin ?? "").trim();
  return (MATCH_ORIGINS as readonly string[]).includes(v) ? v : "vector";
}

/** Files the lazy freshness pass reindexed before this response. */
export function readRefreshedFiles(raw: any): number {
  const v = Number(raw?.refreshed_files ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** `flow_trace.direction` — the tool's own enum. Not caller/callee vocabulary. */
export const FLOW_DIRECTIONS = ["Forward", "Backward", "Both"] as const;
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number];

/**
 * The request parameter names, per tool, as the tools actually accept them.
 * Kept as data so a probe cannot spell one differently from the pin.
 */
export const CODE_INTEL_PARAMS = {
  index_codebase: ["root_path"],
  codebase_map: ["level", "include_metrics"],
  codebase_search: ["query", "top_k"],
  symbol_source: ["fqn"],
  flow_trace: ["fqn", "direction", "max_depth"],
  // The analysis five — the subset each probe/command actually exercises.
  // `scope` is a NodeLevel ("L1_Package" | "L2_Module" | "L3_Symbol"), the same
  // vocabulary codebase_map's `level` takes; `direction` reuses FLOW_DIRECTIONS.
  dependency_graph: ["scope", "max_nodes", "include_mermaid"],
  impact_analysis: ["target", "direction", "max_depth"],
  package_summary: ["fqn"],
  sub_graph: ["seeds", "depth", "direction"],
  symbol_detail: ["fqn", "include_signature"],
} as const;

function num(raw: any, key: string): number {
  const v = raw?.[key];
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function arr(raw: any, key: string): any[] {
  const v = raw?.[key];
  return Array.isArray(v) ? v : [];
}

export interface IndexSummary {
  files: number;
  nodes: number;
  edges: number;
  statements: number;
  errors: string[];
  /** What the index cache did (Orkeon #244): `hit`, `refreshed`, `miss` or `bypassed`; absent before #244. */
  cache?: string;
  /** The files a `refreshed` cache reindexed (`reindexed_file_count`), read when `cache` is. */
  reindexed?: number;
}

/** `index_codebase` → counts. `file_count`, NOT `files_indexed`. */
export function readIndexSummary(raw: any): IndexSummary {
  const cache = typeof raw?.cache === "string" && raw.cache !== "" ? raw.cache : undefined;
  return {
    files: num(raw, "file_count"),
    nodes: num(raw, "node_count"),
    edges: num(raw, "edge_count"),
    statements: num(raw, "statement_count"),
    errors: arr(raw, "errors").map((e) => String(e)),
    ...(cache === undefined ? {} : { cache, reindexed: num(raw, "reindexed_file_count") }),
  };
}

/** What the index cache did, in words: empty on a runtime without the cache (before Orkeon #244). */
export function indexCacheNote(idx: IndexSummary): string {
  switch (idx.cache) {
    case undefined: return "";
    case "hit": return "cache hit: the index an earlier session saved, no file changed";
    case "refreshed": return `cache refreshed: ${idx.reindexed ?? 0} changed file(s) reindexed`;
    case "miss": return "cache miss: built, then saved";
    case "bypassed": return "cache bypassed: rebuilt, then saved";
    default: return `cache ${idx.cache}`;
  }
}

export interface MapEntry {
  fqn: string;
  name: string;
  kind: string;
}

/** `codebase_map` → `entries[]` (+ `totals`), NOT `nodes[]`. */
export function readMapEntries(raw: any): MapEntry[] {
  return arr(raw, "entries").map((e) => ({
    fqn: String(e?.fqn ?? ""),
    name: String(e?.name ?? ""),
    kind: String(e?.kind ?? ""),
  })).filter((e) => e.fqn.length > 0);
}

/** `codebase_map.totals.symbol_count`. */
export function readMapSymbolCount(raw: any): number {
  return num(raw?.totals, "symbol_count");
}

export interface SearchHit {
  fqn: string;
  score: number;
}

/** `codebase_search` → `hits[] { fqn, score }`, NOT `results[]`. */
export function readSearchHits(raw: any): SearchHit[] {
  return arr(raw, "hits").map((h) => ({ fqn: String(h?.fqn ?? ""), score: Number(h?.score ?? 0) }))
    .filter((h) => h.fqn.length > 0);
}

/** `symbol_source` → the source text (`source`; `markdown_ready_block` is the fenced form). */
export function readSymbolSource(raw: any): { source: string; file: string; lines: string } {
  return {
    source: String(raw?.source ?? ""),
    file: String(raw?.virtual_file_path ?? ""),
    lines: `${num(raw, "start_line")}-${num(raw, "end_line")}`,
  };
}

export interface SearchHitWithOrigin {
  fqn: string;
  score: number;
  origin: string;
}

/** `codebase_search` → hits with their origin; a hit without fqn is dropped. The
 *  origin is read on the same raw hit, so a dropped hit cannot shift the others. */
export function readSearchHitsWithOrigin(raw: any): SearchHitWithOrigin[] {
  return arr(raw, "hits").map((h) => ({
    fqn: String(h?.fqn ?? ""), score: Number(h?.score ?? 0), origin: readMatchOrigin(h),
  })).filter((h) => h.fqn.length > 0);
}

/** The longest first line a location keeps: enough to recognise a declaration. */
const FIRST_LINE_MAX = 160;

/** `symbol_source` → path, lines, language and the first non-blank source line
 *  (at most 160 characters). The live payload carries no `fqn`: the requested one
 *  stands in when the field is absent or empty. */
export function readSymbolLocation(raw: any, requestedFqn: string): {
  fqn: string; path: string; startLine: number; endLine: number; language: string; firstLine: string;
} {
  const fqn = String(raw?.fqn ?? "");
  const first = String(raw?.source ?? "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return {
    fqn: fqn.length > 0 ? fqn : requestedFqn,
    path: String(raw?.virtual_file_path ?? ""),
    startLine: num(raw, "start_line"),
    endLine: num(raw, "end_line"),
    language: String(raw?.language ?? ""),
    firstLine: first.slice(0, FIRST_LINE_MAX),
  };
}

/** `flow_trace` → `paths[]`, NOT `edges[]`. An empty array is a valid answer. */
export function readFlowPathCount(raw: any): number {
  return arr(raw, "paths").length;
}

/**
 * The FQN to use for the symbol-level probes: taken from the map rather than
 * invented, so the probe works on any mounted codebase. "" when the map is empty —
 * the caller must then report a SKIP, not a pass on a query that asked nothing.
 */
export function firstSymbolFqn(mapRaw: any): string {
  return readMapEntries(mapRaw)[0]?.fqn ?? "";
}

// ── The analysis five (pinned from the extended probe's live run, 2026-08-06) ──

export interface GraphSummary {
  nodes: Array<{ fqn: string; name: string; kind: string }>;
  edges: Array<{ from: string; to: string; kind: string }>;
  nodeCount: number;
  edgeCount: number;
  cycleCount: number;
}

/** `dependency_graph` / `sub_graph` → `nodes[] {fqn,name,kind}` + `edges[] {from,to,kind}`.
 *  dependency_graph additionally carries `metrics {node_count, edge_count, cycle_count}`;
 *  sub_graph has no metrics block, so the counts fall back to the array lengths.
 *  Two quirks pinned from the live capture (2026-08-06):
 *   • edge `kind` serializes as a NUMBER (the C# EdgeKind enum value, 1 = Imports),
 *     while node `kind` is a string ("module") — coerced to string here;
 *   • edge `from`/`to` are node IDs ("/path#module@0"), NOT the nodes' `fqn` —
 *     joining edges to nodes needs the ID prefix, not equality. */
export function readGraph(raw: any): GraphSummary {
  const nodes = arr(raw, "nodes").map((n) => ({
    fqn: String(n?.fqn ?? ""), name: String(n?.name ?? ""), kind: String(n?.kind ?? ""),
  })).filter((n) => n.fqn.length > 0);
  const edges = arr(raw, "edges").map((e) => ({
    from: String(e?.from ?? ""), to: String(e?.to ?? ""), kind: String(e?.kind ?? ""),
  })).filter((e) => e.from.length > 0 && e.to.length > 0);
  const metrics = raw?.metrics;
  return {
    nodes,
    edges,
    nodeCount: metrics ? num(metrics, "node_count") : nodes.length,
    edgeCount: metrics ? num(metrics, "edge_count") : edges.length,
    cycleCount: metrics ? num(metrics, "cycle_count") : 0,
  };
}

export interface ImpactSummary {
  target: string;
  direct: string[];
  transitive: string[];
  byPackage: Record<string, number>;
}

/** `impact_analysis` → `direct_impact[]` / `transitive_impact[]` / `by_package{}`. */
export function readImpact(raw: any): ImpactSummary {
  const byPackage: Record<string, number> = {};
  const bp = raw?.by_package;
  if (bp && typeof bp === "object" && !Array.isArray(bp)) {
    for (const k of Object.keys(bp)) byPackage[k] = Number(bp[k] ?? 0) || 0;
  }
  return {
    target: String(raw?.target ?? ""),
    direct: arr(raw, "direct_impact").map((s) => String(s)),
    transitive: arr(raw, "transitive_impact").map((s) => String(s)),
    byPackage,
  };
}

export interface PackageSummary {
  fqn: string;
  name: string;
  files: number;
  symbols: number;
  dependencies: string[];
}

/** `package_summary` → `file_count`/`symbol_count` (the index_codebase naming, not files_indexed). */
export function readPackageSummary(raw: any): PackageSummary {
  return {
    fqn: String(raw?.fqn ?? ""),
    name: String(raw?.name ?? ""),
    files: num(raw, "file_count"),
    symbols: num(raw, "symbol_count"),
    dependencies: arr(raw, "dependencies").map((s) => String(s)),
  };
}

export interface SymbolDetail {
  fqn: string;
  name: string;
  kind: string;
  signature: string;
  callers: number;
  callees: number;
}

/** `symbol_detail` → identity + `signature` + `top_callers[]`/`top_callees[]`. */
export function readSymbolDetail(raw: any): SymbolDetail {
  return {
    fqn: String(raw?.fqn ?? ""),
    name: String(raw?.name ?? ""),
    kind: String(raw?.kind ?? ""),
    signature: String(raw?.signature ?? ""),
    callers: arr(raw, "top_callers").length,
    callees: arr(raw, "top_callees").length,
  };
}

// B-14 — payloads captured from a LIVE run on the fixture (2026-08-05, via /debug-tool-call), and the cases the
// code-intel readers are pinned against.

// ── Captured payloads. Verbatim from the live calls; do not "tidy" them. ──
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

export const INDEX_RAW = {
  index_id: "e4efebf4",
  node_count: 9,
  edge_count: 4,
  statement_count: 5,
  file_count: 2,
  elapsed: "00:00:00.7143579",
  errors: [],
  filter_stats: { total_enumerated: 37, excluded_by_language: 5 },
};

export const MAP_RAW = {
  level: "l3_Symbol",
  entries: [
    { fqn: `${WORKSPACE}/src/index.ts::greet`, name: "greet", kind: "function", cyclomatic: 1, lo_c: 3 },
    { fqn: `${WORKSPACE}/src/math.ts::add`, name: "add", kind: "function", cyclomatic: 1, lo_c: 3 },
  ],
  totals: { node_count: 5, package_count: 0, module_count: 0, symbol_count: 5 },
  truncated: false,
};

export const SEARCH_RAW = { hits: [{ fqn: `${WORKSPACE}/src/math.ts::add`, score: 0.7067228684325768 }] };

export const SOURCE_RAW = {
  virtual_file_path: `${WORKSPACE}/src/math.ts`,
  start_line: 1,
  end_line: 3,
  language: "typescript",
  source: "export function add(a: number, b: number): number {\n  return a + b;\n}",
  short_sha: "445deb8d",
};

export const FLOW_RAW = { paths: [], truncated: false };

// ── The analysis five (payloads captured live 2026-08-06, probe run 14/14) ──
// Verbatim from the probe's `<tool> RAW:` log lines on the fixture; do not "tidy".

export const DEP_GRAPH_RAW = {
  nodes: [
    { fqn: `${WORKSPACE}/src/index.ts`, name: "index.ts", kind: "module", level: "l2_Module", is_seed: false },
    { fqn: `${WORKSPACE}/src/math.ts`, name: "math.ts", kind: "module", level: "l2_Module", is_seed: false },
  ],
  edges: [{ from: `${WORKSPACE}/src/index.ts#module@0`, to: `${WORKSPACE}/src/math.ts#module@0`, kind: 1 }],
  metrics: { node_count: 3, edge_count: 1, cycle_count: 0, avg_fan_in: 1, avg_fan_out: 1 },
  truncated: false,
};

export const SUB_GRAPH_RAW = {
  nodes: [{ fqn: `${WORKSPACE}/src/index.ts::greet`, name: "greet", kind: "function", level: "l3_Symbol", is_seed: true }],
  edges: [],
  mermaid_flowchart: "flowchart TD\n  n0[\"Function: greet\"]\n",
  truncated: false,
};

export const IMPACT_RAW = {
  target: `${WORKSPACE}/src/index.ts::greet`,
  direct_impact: [],
  transitive_impact: [],
  by_package: { [`${WORKSPACE}/src/index.ts::greet`]: 1 },
  top_callers: [],
  truncated: false,
};

export const PKG_SUMMARY_RAW = {
  fqn: `${WORKSPACE}::workspace`,
  name: "workspace",
  file_count: 3,
  symbol_count: 6,
  entry_points: [`${WORKSPACE}/src/index.ts`],
  public_exports: [`${WORKSPACE}/src/index.ts::greet`, `${WORKSPACE}/src/math.ts::add`],
  dependencies: [],
  truncated: false,
};

export const SYMBOL_DETAIL_RAW = {
  fqn: `${WORKSPACE}/src/index.ts::greet`,
  name: "greet",
  kind: "function",
  level: "l3_Symbol",
  signature: "function greet(name: string): string",
  doc_comment: "",
  members: [], extends: [], implements: [],
  top_callers: [], top_callees: [], statements: [],
  truncated: false,
};

// ── Hybrid search + lazy freshness pins (captured live 2026-08-05) ─────────

// Verbatim from /debug-tool-call codebase_search {"query":"sumAndScale"} after
// the hybrid work: the exact identifier ranks first as "hybrid", the rest are
// vector-only tail; scores are RRF rank aggregates (~0.03), NOT cosine.
export const HYBRID_SEARCH_RAW = {
  hits: [
    { fqn: `${WORKSPACE}/src/index.ts::sumAndScale`, score: 0.03278688524590164, match_origin: "hybrid" },
    { fqn: `${WORKSPACE}/src/math.ts::divide`, score: 0.016129032258064516, match_origin: "vector" },
  ],
  truncated: true,
  refreshed_files: 2,
};

// ── Cases ──

/** file_count as a string: read as a number when it is one. */
export const INDEX_FILE_COUNTS: readonly { readonly name: string; readonly raw: unknown; readonly files: number }[] = [
  { name: "reads a numeric string as its number", raw: { file_count: "7" }, files: 7 },
  { name: "reads a string that is no number as 0", raw: { file_count: "many" }, files: 0 },
];

/** The cache outcome of index_codebase (Orkeon #244) and the files it reindexed. */
export const INDEX_CACHE_CASES: readonly {
  readonly name: string; readonly raw: unknown; readonly cache: string | undefined; readonly reindexed: number | undefined;
}[] = [
  { name: "a refreshed cache with the files it reindexed", raw: { cache: "refreshed", reindexed_file_count: 3 }, cache: "refreshed", reindexed: 3 },
  { name: "a hit without the count reads 0 reindexed", raw: { cache: "hit" }, cache: "hit", reindexed: 0 },
  { name: "no cache field, a runtime before #244, leaves both out", raw: INDEX_RAW, cache: undefined, reindexed: undefined },
  { name: "an empty cache field leaves both out", raw: { cache: "", reindexed_file_count: 2 }, cache: undefined, reindexed: undefined },
];

export const MAP_SYMBOL_COUNTS: readonly { readonly name: string; readonly raw: unknown; readonly count: number }[] = [
  { name: "the live capture's totals", raw: MAP_RAW, count: 5 },
  { name: "0 without totals", raw: {}, count: 0 },
];

export const FLOW_PATH_COUNTS: readonly { readonly name: string; readonly raw: unknown; readonly count: number }[] = [
  { name: "the live capture's empty paths", raw: FLOW_RAW, count: 0 },
  { name: "two paths", raw: { paths: [1, 2] }, count: 2 },
  { name: "edges are not paths", raw: { edges: [1, 2] }, count: 0 },
];

export const EMPTY_MAPS: readonly { readonly name: string; readonly raw: unknown }[] = [
  { name: "a map without entries", raw: { entries: [] } },
  { name: "no map", raw: undefined },
];

export const MATCH_ORIGIN_CASES: readonly { readonly name: string; readonly hit: unknown; readonly origin: string }[] = [
  { name: "a hybrid hit", hit: HYBRID_SEARCH_RAW.hits[0], origin: "hybrid" },
  { name: "a vector hit", hit: HYBRID_SEARCH_RAW.hits[1], origin: "vector" },
  { name: "an unknown origin", hit: { match_origin: "nonsense" }, origin: "vector" },
  { name: "no origin", hit: {}, origin: "vector" },
];

export const REFRESHED_FILES_CASES: readonly { readonly name: string; readonly raw: unknown; readonly files: number }[] = [
  { name: "the live capture's count", raw: HYBRID_SEARCH_RAW, files: 2 },
  { name: "0 without the field", raw: {}, files: 0 },
  { name: "0 for a negative count", raw: { refreshed_files: -3 }, files: 0 },
];

/** Hits without fqn among hits of every origin, one score a string. */
export const HITS_WITH_HOLES = {
  hits: [
    { fqn: "", score: 0.04, match_origin: "hybrid" },
    { fqn: `${WORKSPACE}/src/math.ts::add`, score: 0.03, match_origin: "bm25" },
    { score: 0.02, match_origin: "vector" },
    { fqn: `${WORKSPACE}/src/index.ts::greet`, score: "0.01", match_origin: "hybrid" },
  ],
};

export const NOT_SEARCH_PAYLOADS: readonly { readonly name: string; readonly raw: unknown }[] = [
  { name: "a missing payload", raw: undefined },
  { name: "results[] instead of hits[]", raw: { results: [{ fqn: "x" }] } },
];

/** Where the live capture's anchor points. */
export const ADD_LOCATION = {
  fqn: `${WORKSPACE}/src/math.ts::add`,
  path: `${WORKSPACE}/src/math.ts`,
  startLine: 1,
  endLine: 3,
  language: "typescript",
  firstLine: "export function add(a: number, b: number): number {",
};

export const LOCATION_FQNS: readonly { readonly name: string; readonly raw: unknown; readonly fqn: string }[] = [
  { name: "prefers the fqn the payload names", raw: { ...SOURCE_RAW, fqn: "pkg.add" }, fqn: "pkg.add" },
  { name: "takes the requested fqn when the payload's is blank", raw: { ...SOURCE_RAW, fqn: "" }, fqn: "asked" },
];

export const FIRST_LINES: readonly { readonly name: string; readonly source: string; readonly firstLine: string }[] = [
  { name: "skips blank lines and trims", source: "\n   \n  const x = 1;  \nnext", firstLine: "const x = 1;" },
  { name: "cuts the first line at 160 characters", source: "a".repeat(200), firstLine: "a".repeat(160) },
];

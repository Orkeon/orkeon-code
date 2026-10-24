// B-14 — the code-intel contract, pinned against payloads captured from a LIVE run
// on the fixture (2026-08-05, via /debug-tool-call). Run:
//   node --test src/shared/domain/code-intel-contract.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  CODE_INTEL_TOOLS, CODE_INTEL_PARAMS, FLOW_DIRECTIONS,
  SEARCH_MODES, MATCH_ORIGINS, RAG_SEARCH_PARAMS, RAG_RAGGABLE_TREE_COLLECTION,
  readIndexSummary, readMapEntries, readMapSymbolCount, readSearchHits,
  readSymbolSource, readFlowPathCount, firstSymbolFqn, readMatchOrigin, readRefreshedFiles,
  readGraph, readImpact, readPackageSummary, readSymbolDetail,
  readSearchHitsWithOrigin, readSymbolLocation,
} from "./code-intel-contract.ts";
import { READ_TOOLS } from "./agent-policy/permission.ts";

// ── Captured payloads. Verbatim from the live calls; do not "tidy" them. ──

const INDEX_RAW = {
  index_id: "e4efebf4",
  node_count: 9,
  edge_count: 4,
  statement_count: 5,
  file_count: 2,
  elapsed: "00:00:00.7143579",
  errors: [],
  filter_stats: { total_enumerated: 37, excluded_by_language: 5 },
};

const MAP_RAW = {
  level: "l3_Symbol",
  entries: [
    { fqn: "/workspace/src/index.ts::greet", name: "greet", kind: "function", cyclomatic: 1, lo_c: 3 },
    { fqn: "/workspace/src/math.ts::add", name: "add", kind: "function", cyclomatic: 1, lo_c: 3 },
  ],
  totals: { node_count: 5, package_count: 0, module_count: 0, symbol_count: 5 },
  truncated: false,
};

const SEARCH_RAW = { hits: [{ fqn: "/workspace/src/math.ts::add", score: 0.7067228684325768 }] };

const SOURCE_RAW = {
  virtual_file_path: "/workspace/src/math.ts",
  start_line: 1,
  end_line: 3,
  language: "typescript",
  source: "export function add(a: number, b: number): number {\n  return a + b;\n}",
  short_sha: "445deb8d",
};

const FLOW_RAW = { paths: [], truncated: false };

describe("B-14 acceptance 1 — the catalogue grants all five code-intel tools", () => {
  it("every code-intel tool is in the main-loop read catalogue", () => {
    // Static, so it fails in CI rather than at the moment an agent needs the tool.
    for (const tool of CODE_INTEL_TOOLS) {
      ok(READ_TOOLS.includes(tool), `${tool} missing from READ_TOOLS`);
    }
  });

  it("they are read-side: none of them can mutate the workspace", () => {
    // index_codebase writes a derived graph/cache, never source — which is why it
    // belongs here and not with file_write.
    strictEqual(CODE_INTEL_TOOLS.includes("file_write" as any), false);
  });
});

describe("readIndexSummary — the reader that was silently wrong", () => {
  it("reads file_count, NOT files_indexed", () => {
    // The original probe looked for `files_indexed`, got undefined, and reported
    // "indexed 0 file(s)" from a call that had just indexed 2. A successful call
    // reporting zero is worse than a failure: it reads as an empty workspace.
    const s = readIndexSummary(INDEX_RAW);
    strictEqual(s.files, 2);
    strictEqual(s.nodes, 9);
    strictEqual(s.edges, 4);
    strictEqual(s.statements, 5);
  });

  it("does not accept the field name we guessed first", () => {
    strictEqual(readIndexSummary({ files_indexed: 99 }).files, 0);
  });

  it("survives a missing or malformed payload", () => {
    deepStrictEqual(readIndexSummary(undefined), { files: 0, nodes: 0, edges: 0, statements: 0, errors: [] });
    strictEqual(readIndexSummary({ file_count: "7" }).files, 7);
    strictEqual(readIndexSummary({ file_count: "many" }).files, 0);
  });

  it("surfaces the tool's own errors array", () => {
    deepStrictEqual(readIndexSummary({ errors: ["boom"] }).errors, ["boom"]);
  });
});

describe("readMapEntries / readMapSymbolCount", () => {
  it("reads entries[], not nodes[]", () => {
    strictEqual(readMapEntries(MAP_RAW).length, 2);
    strictEqual(readMapEntries({ nodes: [{ fqn: "x" }] }).length, 0);
  });

  it("keeps fqn, name and kind", () => {
    deepStrictEqual(readMapEntries(MAP_RAW)[0], {
      fqn: "/workspace/src/index.ts::greet", name: "greet", kind: "function",
    });
  });

  it("drops an entry with no fqn — it cannot be queried further", () => {
    strictEqual(readMapEntries({ entries: [{ name: "orphan" }] }).length, 0);
  });

  it("reads the symbol count from totals", () => {
    strictEqual(readMapSymbolCount(MAP_RAW), 5);
    strictEqual(readMapSymbolCount({}), 0);
  });
});

describe("readSearchHits", () => {
  it("reads hits[] { fqn, score }, not results[]", () => {
    deepStrictEqual(readSearchHits(SEARCH_RAW), [
      { fqn: "/workspace/src/math.ts::add", score: 0.7067228684325768 },
    ]);
    deepStrictEqual(readSearchHits({ results: [{ fqn: "x" }] }), []);
  });

  it("an empty hit list is a valid answer, not an error", () => {
    deepStrictEqual(readSearchHits({ hits: [] }), []);
  });
});

describe("readSymbolSource", () => {
  it("reads the source text and where it came from", () => {
    const s = readSymbolSource(SOURCE_RAW);
    ok(s.source.startsWith("export function add"));
    strictEqual(s.file, "/workspace/src/math.ts");
    strictEqual(s.lines, "1-3");
  });
});

describe("readFlowPathCount", () => {
  it("reads paths[], not edges[]", () => {
    strictEqual(readFlowPathCount(FLOW_RAW), 0);
    strictEqual(readFlowPathCount({ paths: [1, 2] }), 2);
    strictEqual(readFlowPathCount({ edges: [1, 2] }), 0);
  });
});

describe("firstSymbolFqn", () => {
  it("takes the first mapped symbol, so the probe fits any codebase", () => {
    strictEqual(firstSymbolFqn(MAP_RAW), "/workspace/src/index.ts::greet");
  });

  it("returns '' on an empty map, so the caller reports a SKIP", () => {
    // Passing a pass on a query that asked nothing is the whole failure mode B-14
    // exists to stop.
    strictEqual(firstSymbolFqn({ entries: [] }), "");
    strictEqual(firstSymbolFqn(undefined), "");
  });
});

describe("the pinned request parameters", () => {
  it("symbol_source takes fqn — 'symbol_name' is not a parameter", () => {
    deepStrictEqual(CODE_INTEL_PARAMS.symbol_source, ["fqn"]);
  });

  it("flow_trace's direction vocabulary is the tool's enum, not caller/callee", () => {
    // 'callees' is a typed deserialization failure:
    //   Invalid value 'callees' for Direction. Valid values: Forward, Backward, Both.
    deepStrictEqual([...FLOW_DIRECTIONS], ["Forward", "Backward", "Both"]);
    strictEqual((FLOW_DIRECTIONS as readonly string[]).includes("callees"), false);
  });

  it("declares parameters for every tool, and only for those ten", () => {
    deepStrictEqual(Object.keys(CODE_INTEL_PARAMS).sort(), [...CODE_INTEL_TOOLS].sort());
    strictEqual(CODE_INTEL_TOOLS.length, 10);
  });
});

// ── The analysis five (payloads captured live 2026-08-06, probe run 14/14) ──
// Verbatim from the probe's `<tool> RAW:` log lines on the fixture; do not "tidy".

const DEP_GRAPH_RAW = {
  nodes: [
    { fqn: "/workspace/src/index.ts", name: "index.ts", kind: "module", level: "l2_Module", is_seed: false },
    { fqn: "/workspace/src/math.ts", name: "math.ts", kind: "module", level: "l2_Module", is_seed: false },
  ],
  edges: [{ from: "/workspace/src/index.ts#module@0", to: "/workspace/src/math.ts#module@0", kind: 1 }],
  metrics: { node_count: 3, edge_count: 1, cycle_count: 0, avg_fan_in: 1, avg_fan_out: 1 },
  truncated: false,
};

const SUB_GRAPH_RAW = {
  nodes: [{ fqn: "/workspace/src/index.ts::greet", name: "greet", kind: "function", level: "l3_Symbol", is_seed: true }],
  edges: [],
  mermaid_flowchart: "flowchart TD\n  n0[\"Function: greet\"]\n",
  truncated: false,
};

const IMPACT_RAW = {
  target: "/workspace/src/index.ts::greet",
  direct_impact: [],
  transitive_impact: [],
  by_package: { "/workspace/src/index.ts::greet": 1 },
  top_callers: [],
  truncated: false,
};

const PKG_SUMMARY_RAW = {
  fqn: "/workspace::workspace",
  name: "workspace",
  file_count: 3,
  symbol_count: 6,
  entry_points: ["/workspace/src/index.ts"],
  public_exports: ["/workspace/src/index.ts::greet", "/workspace/src/math.ts::add"],
  dependencies: [],
  truncated: false,
};

const SYMBOL_DETAIL_RAW = {
  fqn: "/workspace/src/index.ts::greet",
  name: "greet",
  kind: "function",
  level: "l3_Symbol",
  signature: "function greet(name: string): string",
  doc_comment: "",
  members: [], extends: [], implements: [],
  top_callers: [], top_callees: [], statements: [],
  truncated: false,
};

describe("readGraph — dependency_graph and sub_graph", () => {
  it("reads nodes/edges and prefers the metrics counts when present", () => {
    const g = readGraph(DEP_GRAPH_RAW);
    strictEqual(g.nodes.length, 2);
    strictEqual(g.nodes[0]!.fqn, "/workspace/src/index.ts");
    // metrics says 3 (the capture had a third module) even though this fixture
    // trims to 2 nodes — the metrics block is authoritative when present.
    strictEqual(g.nodeCount, 3);
    strictEqual(g.edgeCount, 1);
    strictEqual(g.cycleCount, 0);
  });

  it("edge kind is a NUMBER on the wire (EdgeKind enum value), coerced to string", () => {
    // Node kind is a string ("module"), edge kind is 1 — pinned so nobody
    // "fixes" the reader to expect "imports" and silently drops every edge.
    strictEqual(readGraph(DEP_GRAPH_RAW).edges[0]!.kind, "1");
  });

  it("edge from/to are node IDs, not FQNs", () => {
    const e = readGraph(DEP_GRAPH_RAW).edges[0]!;
    ok(e.from.includes("#module@"), e.from);
    ok(e.from.startsWith("/workspace/src/index.ts"), "the node ID still starts with the path");
  });

  it("sub_graph has no metrics block — counts fall back to array lengths", () => {
    const g = readGraph(SUB_GRAPH_RAW);
    strictEqual(g.nodeCount, 1);
    strictEqual(g.edgeCount, 0);
    strictEqual(g.cycleCount, 0);
  });

  it("survives an empty or malformed payload", () => {
    deepStrictEqual(readGraph(undefined), { nodes: [], edges: [], nodeCount: 0, edgeCount: 0, cycleCount: 0 });
  });
});

describe("readImpact", () => {
  it("reads direct_impact/transitive_impact/by_package", () => {
    const s = readImpact(IMPACT_RAW);
    strictEqual(s.target, "/workspace/src/index.ts::greet");
    deepStrictEqual(s.direct, []);
    deepStrictEqual(s.transitive, []);
    // Quirk: by_package includes the TARGET itself (count 1) even with zero
    // callers — an "impact" of 1 package is the floor, not a finding.
    deepStrictEqual(s.byPackage, { "/workspace/src/index.ts::greet": 1 });
  });

  it("an empty impact is a valid answer for a leaf symbol", () => {
    const s = readImpact({ target: "x", direct_impact: [], transitive_impact: [], by_package: {} });
    strictEqual(s.direct.length + s.transitive.length, 0);
  });
});

describe("readPackageSummary", () => {
  it("reads file_count/symbol_count — the index_codebase naming, again", () => {
    const p = readPackageSummary(PKG_SUMMARY_RAW);
    strictEqual(p.fqn, "/workspace::workspace");
    strictEqual(p.files, 3);
    strictEqual(p.symbols, 6);
    deepStrictEqual(p.dependencies, []);
  });
});

describe("readSymbolDetail", () => {
  it("reads identity, signature and the caller/callee counts", () => {
    const d = readSymbolDetail(SYMBOL_DETAIL_RAW);
    strictEqual(d.fqn, "/workspace/src/index.ts::greet");
    strictEqual(d.kind, "function");
    strictEqual(d.signature, "function greet(name: string): string");
    strictEqual(d.callers, 0);
    strictEqual(d.callees, 0);
  });

  it("a missing payload reads as empty, never throws", () => {
    strictEqual(readSymbolDetail(undefined).fqn, "");
  });
});

// ── Hybrid search + lazy freshness pins (captured live 2026-08-05) ─────────

describe("hybrid search surfaces", () => {
  // Verbatim from /debug-tool-call codebase_search {"query":"sumAndScale"} after
  // the hybrid work: the exact identifier ranks first as "hybrid", the rest are
  // vector-only tail; scores are RRF rank aggregates (~0.03), NOT cosine.
  const SEARCH_RAW = {
    hits: [
      { fqn: "/workspace/src/index.ts::sumAndScale", score: 0.03278688524590164, match_origin: "hybrid" },
      { fqn: "/workspace/src/math.ts::divide", score: 0.016129032258064516, match_origin: "vector" },
    ],
    truncated: true,
    refreshed_files: 2,
  };

  it("reads match_origin per hit, defaulting unknown to 'vector'", () => {
    strictEqual(readMatchOrigin(SEARCH_RAW.hits[0]), "hybrid");
    strictEqual(readMatchOrigin(SEARCH_RAW.hits[1]), "vector");
    strictEqual(readMatchOrigin({ match_origin: "nonsense" }), "vector");
    strictEqual(readMatchOrigin({}), "vector");
  });

  it("reads refreshed_files — the 'this search paid for its own freshness' signal", () => {
    strictEqual(readRefreshedFiles(SEARCH_RAW), 2);
    strictEqual(readRefreshedFiles({}), 0);
    strictEqual(readRefreshedFiles({ refreshed_files: -3 }), 0);
  });

  it("pins the mode vocabulary (the C# enum, PascalCase)", () => {
    deepStrictEqual([...SEARCH_MODES], ["Hybrid", "Vector", "Lexical"]);
    deepStrictEqual([...MATCH_ORIGINS], ["hybrid", "vector", "bm25"]);
  });
});

describe("rag_search parameter names", () => {
  it("takes 'question', NOT 'query' — caught live before wiring", () => {
    // /debug-tool-call rag_search {"query": ...} → "question parameter is required".
    // Third occurrence of the same failure shape this week; the pin is the cure.
    ok((RAG_SEARCH_PARAMS as readonly string[]).includes("question"));
    ok(!(RAG_SEARCH_PARAMS as readonly string[]).includes("query"));
  });

  it("names the code-index collection", () => {
    strictEqual(RAG_RAGGABLE_TREE_COLLECTION, "raggable-tree");
  });
});

describe("readSearchHitsWithOrigin — the hits /dev-plan ranks", () => {
  it("reads the live capture, whose hit predates match_origin, as vector", () => {
    deepStrictEqual(readSearchHitsWithOrigin(SEARCH_RAW), [
      { fqn: "/workspace/src/math.ts::add", score: 0.7067228684325768, origin: "vector" },
    ]);
  });

  it("keeps a bm25 origin on its own hit after a hit without fqn is dropped", () => {
    const raw = {
      hits: [
        { fqn: "", score: 0.04, match_origin: "hybrid" },
        { fqn: "/workspace/src/math.ts::add", score: 0.03, match_origin: "bm25" },
        { score: 0.02, match_origin: "vector" },
        { fqn: "/workspace/src/index.ts::greet", score: "0.01", match_origin: "hybrid" },
      ],
    };
    deepStrictEqual(readSearchHitsWithOrigin(raw), [
      { fqn: "/workspace/src/math.ts::add", score: 0.03, origin: "bm25" },
      { fqn: "/workspace/src/index.ts::greet", score: 0.01, origin: "hybrid" },
    ]);
  });

  it("answers nothing for a missing or malformed payload", () => {
    deepStrictEqual(readSearchHitsWithOrigin(undefined), []);
    deepStrictEqual(readSearchHitsWithOrigin({ results: [{ fqn: "x" }] }), []);
  });
});

describe("readSymbolLocation — where an anchor points", () => {
  it("reads the live capture, taking the requested fqn it does not carry", () => {
    deepStrictEqual(readSymbolLocation(SOURCE_RAW, "/workspace/src/math.ts::add"), {
      fqn: "/workspace/src/math.ts::add",
      path: "/workspace/src/math.ts",
      startLine: 1,
      endLine: 3,
      language: "typescript",
      firstLine: "export function add(a: number, b: number): number {",
    });
  });

  it("prefers the fqn the payload names", () => {
    strictEqual(readSymbolLocation({ ...SOURCE_RAW, fqn: "pkg.add" }, "asked").fqn, "pkg.add");
    strictEqual(readSymbolLocation({ ...SOURCE_RAW, fqn: "" }, "asked").fqn, "asked");
  });

  it("skips blank lines, trims, and cuts the first line at 160 characters", () => {
    strictEqual(readSymbolLocation({ source: "\n   \n  const x = 1;  \nnext" }, "f").firstLine, "const x = 1;");
    strictEqual(readSymbolLocation({ source: "a".repeat(200) }, "f").firstLine, "a".repeat(160));
  });

  it("answers empty fields and zero lines when the payload has none", () => {
    deepStrictEqual(readSymbolLocation({}, "f"), {
      fqn: "f", path: "", startLine: 0, endLine: 0, language: "", firstLine: "",
    });
  });
});

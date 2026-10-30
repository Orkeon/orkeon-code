// B-14 — the code-intel contract, pinned against payloads captured from a LIVE run
// on the fixture (2026-08-05, via /debug-tool-call). Run:
//   node --test tests/shared/domain/code-intel-contract.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  CODE_INTEL_TOOLS, CODE_INTEL_PARAMS, FLOW_DIRECTIONS,
  SEARCH_MODES, MATCH_ORIGINS, RAG_SEARCH_PARAMS, RAG_RAGGABLE_TREE_COLLECTION,
  indexCacheNote, readIndexSummary, readMapEntries, readMapSymbolCount, readSearchHits,
  readSymbolSource, readFlowPathCount, firstSymbolFqn, readMatchOrigin, readRefreshedFiles,
  readGraph, readImpact, readPackageSummary, readSymbolDetail,
  readSearchHitsWithOrigin, readSymbolLocation,
} from "../../../src/shared/domain/code-intel-contract.ts";
import { READ_TOOLS } from "../../../src/shared/domain/agent-policy/permission.ts";
import {
  ADD_LOCATION, DEP_GRAPH_RAW, EMPTY_MAPS, FIRST_LINES, FLOW_PATH_COUNTS, HITS_WITH_HOLES, IMPACT_RAW,
  INDEX_CACHE_CASES, INDEX_CACHE_NOTES, INDEX_FILE_COUNTS, INDEX_RAW, LOCATION_FQNS, MAP_RAW, MAP_SYMBOL_COUNTS, MATCH_ORIGIN_CASES, NOT_SEARCH_PAYLOADS,
  PKG_SUMMARY_RAW, REFRESHED_FILES_CASES, SEARCH_RAW, SOURCE_RAW, SUB_GRAPH_RAW, SYMBOL_DETAIL_RAW,
} from "./code-intel-contract.fixtures.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

describe("B-14 acceptance 1 — the catalogue grants all five code-intel tools", () => {
  for (const tool of CODE_INTEL_TOOLS) {
    it(`every code-intel tool is in the main-loop read catalogue: ${tool}`, () => {
      // Static, so it fails in CI rather than at the moment an agent needs the tool.
      // Arrange
      const catalogue: readonly string[] = READ_TOOLS;

      // Act
      const granted = catalogue.includes(tool);

      // Assert
      ok(granted, `${tool} missing from READ_TOOLS`);
    });
  }

  it("they are read-side: none of them can mutate the workspace", () => {
    // index_codebase writes a derived graph/cache, never source — which is why it
    // belongs here and not with file_write.
    // Arrange
    const tools: readonly string[] = CODE_INTEL_TOOLS;

    // Act
    const writes = tools.includes("file_write");

    // Assert
    strictEqual(writes, false);
  });
});

describe("readIndexSummary — the reader that was silently wrong", () => {
  it("reads file_count, NOT files_indexed", () => {
    // The original probe looked for `files_indexed`, got undefined, and reported
    // "indexed 0 file(s)" from a call that had just indexed 2. A successful call
    // reporting zero is worse than a failure: it reads as an empty workspace.
    // Arrange
    const raw = INDEX_RAW;

    // Act
    const s = readIndexSummary(raw);

    // Assert
    strictEqual(s.files, 2);
    strictEqual(s.nodes, 9);
    strictEqual(s.edges, 4);
    strictEqual(s.statements, 5);
  });

  it("does not accept the field name we guessed first", () => {
    // Arrange
    const raw = { files_indexed: 99 };

    // Act
    const s = readIndexSummary(raw);

    // Assert
    strictEqual(s.files, 0);
  });

  it("survives a missing payload", () => {
    // Arrange
    const raw = undefined;

    // Act
    const s = readIndexSummary(raw);

    // Assert
    deepStrictEqual(s, { files: 0, nodes: 0, edges: 0, statements: 0, errors: [] });
  });

  for (const c of INDEX_FILE_COUNTS) {
    it(`survives a malformed payload: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const s = readIndexSummary(raw);

      // Assert
      strictEqual(s.files, c.files);
    });
  }

  for (const c of INDEX_CACHE_CASES) {
    it(`reads what the index cache did: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const s = readIndexSummary(raw);

      // Assert
      deepStrictEqual({ cache: s.cache, reindexed: s.reindexed }, { cache: c.cache, reindexed: c.reindexed });
    });
  }

  it("surfaces the tool's own errors array", () => {
    // Arrange
    const raw = { errors: ["boom"] };

    // Act
    const s = readIndexSummary(raw);

    // Assert
    deepStrictEqual(s.errors, ["boom"]);
  });
});

describe("indexCacheNote — what the index cache did, in words", () => {
  for (const c of INDEX_CACHE_NOTES) {
    it(`says ${c.name}`, () => {
      // Arrange
      const { idx } = c;

      // Act
      const note = indexCacheNote(idx);

      // Assert
      strictEqual(note, c.note);
    });
  }
});

describe("readMapEntries / readMapSymbolCount", () => {
  it("reads entries[]", () => {
    // Arrange
    const raw = MAP_RAW;

    // Act
    const entries = readMapEntries(raw);

    // Assert
    strictEqual(entries.length, 2);
  });

  it("reads entries[], not nodes[]", () => {
    // Arrange
    const raw = { nodes: [{ fqn: "x" }] };

    // Act
    const entries = readMapEntries(raw);

    // Assert
    strictEqual(entries.length, 0);
  });

  it("keeps fqn, name and kind", () => {
    // Arrange
    const raw = MAP_RAW;

    // Act
    const [first] = readMapEntries(raw);

    // Assert
    deepStrictEqual(first, { fqn: `${WORKSPACE}/src/index.ts::greet`, name: "greet", kind: "function" });
  });

  it("drops an entry with no fqn — it cannot be queried further", () => {
    // Arrange
    const raw = { entries: [{ name: "orphan" }] };

    // Act
    const entries = readMapEntries(raw);

    // Assert
    strictEqual(entries.length, 0);
  });

  for (const c of MAP_SYMBOL_COUNTS) {
    it(`reads the symbol count from totals: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const count = readMapSymbolCount(raw);

      // Assert
      strictEqual(count, c.count);
    });
  }
});

describe("readSearchHits", () => {
  it("reads hits[] { fqn, score }", () => {
    // Arrange
    const raw = SEARCH_RAW;

    // Act
    const hits = readSearchHits(raw);

    // Assert
    deepStrictEqual(hits, [{ fqn: `${WORKSPACE}/src/math.ts::add`, score: 0.7067228684325768 }]);
  });

  it("reads hits[], not results[]", () => {
    // Arrange
    const raw = { results: [{ fqn: "x" }] };

    // Act
    const hits = readSearchHits(raw);

    // Assert
    deepStrictEqual(hits, []);
  });

  it("an empty hit list is a valid answer, not an error", () => {
    // Arrange
    const raw = { hits: [] };

    // Act
    const hits = readSearchHits(raw);

    // Assert
    deepStrictEqual(hits, []);
  });
});

describe("readSymbolSource", () => {
  it("reads the source text and where it came from", () => {
    // Arrange
    const raw = SOURCE_RAW;

    // Act
    const s = readSymbolSource(raw);

    // Assert
    ok(s.source.startsWith("export function add"));
    strictEqual(s.file, `${WORKSPACE}/src/math.ts`);
    strictEqual(s.lines, "1-3");
  });
});

describe("readFlowPathCount", () => {
  for (const c of FLOW_PATH_COUNTS) {
    it(`reads paths[], not edges[]: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const count = readFlowPathCount(raw);

      // Assert
      strictEqual(count, c.count);
    });
  }
});

describe("firstSymbolFqn", () => {
  it("takes the first mapped symbol, so the probe fits any codebase", () => {
    // Arrange
    const raw = MAP_RAW;

    // Act
    const fqn = firstSymbolFqn(raw);

    // Assert
    strictEqual(fqn, `${WORKSPACE}/src/index.ts::greet`);
  });

  for (const c of EMPTY_MAPS) {
    it(`returns '' on an empty map, so the caller reports a SKIP: ${c.name}`, () => {
      // Passing a pass on a query that asked nothing is the whole failure mode B-14
      // exists to stop.
      // Arrange
      const { raw } = c;

      // Act
      const fqn = firstSymbolFqn(raw);

      // Assert
      strictEqual(fqn, "");
    });
  }
});

describe("the pinned request parameters", () => {
  it("symbol_source takes fqn — 'symbol_name' is not a parameter", () => {
    // Arrange
    const params = CODE_INTEL_PARAMS;

    // Act
    const sourceParams = params.symbol_source;

    // Assert
    deepStrictEqual(sourceParams, ["fqn"]);
  });

  it("flow_trace's direction vocabulary is the tool's enum, not caller/callee", () => {
    // 'callees' is a typed deserialization failure:
    //   Invalid value 'callees' for Direction. Valid values: Forward, Backward, Both.
    // Arrange
    const vocabulary = FLOW_DIRECTIONS;

    // Act
    const directions: readonly string[] = [...vocabulary];

    // Assert
    deepStrictEqual(directions, ["Forward", "Backward", "Both"]);
    strictEqual(directions.includes("callees"), false);
  });

  it("declares parameters for every tool, and only for those", () => {
    // Arrange
    const tools = [...CODE_INTEL_TOOLS].sort();

    // Act
    const declared = Object.keys(CODE_INTEL_PARAMS).sort();

    // Assert
    deepStrictEqual(declared, tools);
  });

  it("counts ten code-intel tools", () => {
    // Arrange
    const expected = 10;

    // Act
    const count = CODE_INTEL_TOOLS.length;

    // Assert
    strictEqual(count, expected);
  });
});

describe("readGraph — dependency_graph and sub_graph", () => {
  it("reads nodes/edges and prefers the metrics counts when present", () => {
    // Arrange
    const raw = DEP_GRAPH_RAW;

    // Act
    const g = readGraph(raw);

    // Assert
    strictEqual(g.nodes.length, 2);
    strictEqual(g.nodes[0]!.fqn, `${WORKSPACE}/src/index.ts`);
    // metrics says 3 (the capture had a third module) even though this fixture
    // trims to 2 nodes — the metrics block is authoritative when present.
    strictEqual(g.nodeCount, 3);
    strictEqual(g.edgeCount, 1);
    strictEqual(g.cycleCount, 0);
  });

  it("edge kind is a NUMBER on the wire (EdgeKind enum value), coerced to string", () => {
    // Node kind is a string ("module"), edge kind is 1 — pinned so nobody
    // "fixes" the reader to expect "imports" and silently drops every edge.
    // Arrange
    const raw = DEP_GRAPH_RAW;

    // Act
    const edge = readGraph(raw).edges[0]!;

    // Assert
    strictEqual(edge.kind, "1");
  });

  it("edge from/to are node IDs, not FQNs", () => {
    // Arrange
    const raw = DEP_GRAPH_RAW;

    // Act
    const e = readGraph(raw).edges[0]!;

    // Assert
    ok(e.from.includes("#module@"), e.from);
    ok(e.from.startsWith(`${WORKSPACE}/src/index.ts`), "the node ID still starts with the path");
  });

  it("sub_graph has no metrics block — counts fall back to array lengths", () => {
    // Arrange
    const raw = SUB_GRAPH_RAW;

    // Act
    const g = readGraph(raw);

    // Assert
    strictEqual(g.nodeCount, 1);
    strictEqual(g.edgeCount, 0);
    strictEqual(g.cycleCount, 0);
  });

  it("survives an empty or malformed payload", () => {
    // Arrange
    const raw = undefined;

    // Act
    const g = readGraph(raw);

    // Assert
    deepStrictEqual(g, { nodes: [], edges: [], nodeCount: 0, edgeCount: 0, cycleCount: 0 });
  });
});

describe("readImpact", () => {
  it("reads direct_impact/transitive_impact/by_package", () => {
    // Arrange
    const raw = IMPACT_RAW;

    // Act
    const s = readImpact(raw);

    // Assert
    strictEqual(s.target, `${WORKSPACE}/src/index.ts::greet`);
    deepStrictEqual(s.direct, []);
    deepStrictEqual(s.transitive, []);
    // Quirk: by_package includes the TARGET itself (count 1) even with zero
    // callers — an "impact" of 1 package is the floor, not a finding.
    deepStrictEqual(s.byPackage, { [`${WORKSPACE}/src/index.ts::greet`]: 1 });
  });

  it("an empty impact is a valid answer for a leaf symbol", () => {
    // Arrange
    const raw = { target: "x", direct_impact: [], transitive_impact: [], by_package: {} };

    // Act
    const s = readImpact(raw);

    // Assert
    strictEqual(s.direct.length + s.transitive.length, 0);
  });
});

describe("readPackageSummary", () => {
  it("reads file_count/symbol_count — the index_codebase naming, again", () => {
    // Arrange
    const raw = PKG_SUMMARY_RAW;

    // Act
    const p = readPackageSummary(raw);

    // Assert
    strictEqual(p.fqn, `${WORKSPACE}::workspace`);
    strictEqual(p.files, 3);
    strictEqual(p.symbols, 6);
    deepStrictEqual(p.dependencies, []);
  });
});

describe("readSymbolDetail", () => {
  it("reads identity, signature and the caller/callee counts", () => {
    // Arrange
    const raw = SYMBOL_DETAIL_RAW;

    // Act
    const d = readSymbolDetail(raw);

    // Assert
    strictEqual(d.fqn, `${WORKSPACE}/src/index.ts::greet`);
    strictEqual(d.kind, "function");
    strictEqual(d.signature, "function greet(name: string): string");
    strictEqual(d.callers, 0);
    strictEqual(d.callees, 0);
  });

  it("a missing payload reads as empty, never throws", () => {
    // Arrange
    const raw = undefined;

    // Act
    const d = readSymbolDetail(raw);

    // Assert
    strictEqual(d.fqn, "");
  });
});

// ── Hybrid search + lazy freshness pins (captured live 2026-08-05) ─────────

describe("hybrid search surfaces", () => {
  for (const c of MATCH_ORIGIN_CASES) {
    it(`reads match_origin per hit, defaulting unknown to 'vector': ${c.name}`, () => {
      // Arrange
      const { hit } = c;

      // Act
      const origin = readMatchOrigin(hit);

      // Assert
      strictEqual(origin, c.origin);
    });
  }

  for (const c of REFRESHED_FILES_CASES) {
    it(`reads refreshed_files — the 'this search paid for its own freshness' signal: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const files = readRefreshedFiles(raw);

      // Assert
      strictEqual(files, c.files);
    });
  }

  it("pins the mode vocabulary (the C# enum, PascalCase)", () => {
    // Arrange
    const vocabulary = SEARCH_MODES;

    // Act
    const modes = [...vocabulary];

    // Assert
    deepStrictEqual(modes, ["Hybrid", "Vector", "Lexical"]);
  });

  it("pins the match origins", () => {
    // Arrange
    const vocabulary = MATCH_ORIGINS;

    // Act
    const origins = [...vocabulary];

    // Assert
    deepStrictEqual(origins, ["hybrid", "vector", "bm25"]);
  });
});

describe("rag_search parameter names", () => {
  it("takes 'question', NOT 'query' — caught live before wiring", () => {
    // /debug-tool-call rag_search {"query": ...} → "question parameter is required".
    // Third occurrence of the same failure shape this week; the pin is the cure.
    // Arrange
    const pinned = RAG_SEARCH_PARAMS;

    // Act
    const params: readonly string[] = pinned;

    // Assert
    ok(params.includes("question"));
    ok(!params.includes("query"));
  });

  it("names the code-index collection", () => {
    // Arrange
    const expected = "raggable-tree";

    // Act
    const collection = RAG_RAGGABLE_TREE_COLLECTION;

    // Assert
    strictEqual(collection, expected);
  });
});

describe("readSearchHitsWithOrigin — the hits /dev-plan ranks", () => {
  it("reads the live capture, whose hit predates match_origin, as vector", () => {
    // Arrange
    const raw = SEARCH_RAW;

    // Act
    const hits = readSearchHitsWithOrigin(raw);

    // Assert
    deepStrictEqual(hits, [{ fqn: `${WORKSPACE}/src/math.ts::add`, score: 0.7067228684325768, origin: "vector" }]);
  });

  it("keeps a bm25 origin on its own hit after a hit without fqn is dropped", () => {
    // Arrange
    const raw = HITS_WITH_HOLES;

    // Act
    const hits = readSearchHitsWithOrigin(raw);

    // Assert
    deepStrictEqual(hits, [
      { fqn: `${WORKSPACE}/src/math.ts::add`, score: 0.03, origin: "bm25" },
      { fqn: `${WORKSPACE}/src/index.ts::greet`, score: 0.01, origin: "hybrid" },
    ]);
  });

  for (const c of NOT_SEARCH_PAYLOADS) {
    it(`answers nothing for a missing or malformed payload: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const hits = readSearchHitsWithOrigin(raw);

      // Assert
      deepStrictEqual(hits, []);
    });
  }
});

describe("readSymbolLocation — where an anchor points", () => {
  it("reads the live capture, taking the requested fqn it does not carry", () => {
    // Arrange
    const raw = SOURCE_RAW;

    // Act
    const location = readSymbolLocation(raw, `${WORKSPACE}/src/math.ts::add`);

    // Assert
    deepStrictEqual(location, ADD_LOCATION);
  });

  for (const c of LOCATION_FQNS) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const location = readSymbolLocation(raw, "asked");

      // Assert
      strictEqual(location.fqn, c.fqn);
    });
  }

  for (const c of FIRST_LINES) {
    it(`skips blank lines, trims, and cuts the first line at 160 characters: ${c.name}`, () => {
      // Arrange
      const raw = { source: c.source };

      // Act
      const location = readSymbolLocation(raw, "f");

      // Assert
      strictEqual(location.firstLine, c.firstLine);
    });
  }

  it("answers empty fields and zero lines when the payload has none", () => {
    // Arrange
    const raw = {};

    // Act
    const location = readSymbolLocation(raw, "f");

    // Assert
    deepStrictEqual(location, { fqn: "f", path: "", startLine: 0, endLine: 0, language: "", firstLine: "" });
  });
});

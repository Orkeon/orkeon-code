// The CodeIndex adapter over the FakeTools code-intelligence tools, and the AnchorIndex adapter over a
// batch_anchors stub (FakeTools fakes no batch_anchors). Run:
//   node --test src/shared/infrastructure/orkeon/code-index.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createAnchorIndex, createCodeIndex } from "./code-index.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";

describe("createCodeIndex", () => {
  it("counts the indexed roots, none when the status lists no array", async () => {
    const tools = new FakeTools();
    tools.replies.indexStatus = { roots: ["/workspace", "/other"] };
    strictEqual(await createCodeIndex(tools).rootCount(), 2);
    tools.replies.indexStatus = { roots: "none" };
    strictEqual(await createCodeIndex(tools).rootCount(), 0);
    deepStrictEqual(tools.inputsOf("indexStatus"), [{}, {}]);
  });

  it("indexes a root and reads the counts", async () => {
    const tools = new FakeTools();
    tools.replies.indexCodebase = { file_count: 12, node_count: 40, edge_count: 7, statement_count: 3, errors: ["x"] };
    deepStrictEqual(await createCodeIndex(tools).index("/workspace"), {
      files: 12, nodes: 40, edges: 7, statements: 3, errors: ["x"],
    });
    deepStrictEqual(tools.inputsOf("indexCodebase"), [{ root_path: "/workspace" }]);
  });

  it("reads a map's entries and symbol total, asking for metrics only when told", async () => {
    const tools = new FakeTools();
    tools.replies.codebaseMap = { entries: [{ fqn: "pkg.F", name: "F", kind: "function" }, { name: "no fqn" }], totals: { symbol_count: 9 } };
    const index = createCodeIndex(tools);
    deepStrictEqual(await index.map("L3_Symbol", true), { entries: [{ fqn: "pkg.F", name: "F", kind: "function" }], symbolCount: 9 });
    await index.map("L1_Package", false);
    deepStrictEqual(tools.inputsOf("codebaseMap"), [{ level: "L3_Symbol", include_metrics: true }, { level: "L1_Package" }]);
  });

  it("reads the dependency graph of a scope, without its mermaid rendering", async () => {
    const tools = new FakeTools();
    tools.replies.dependencyGraph = {
      nodes: [{ fqn: "a", name: "a", kind: "module" }],
      edges: [{ from: "/a.ts#module@0", to: "/b.ts#module@0", kind: 1 }],
      metrics: { node_count: 2, edge_count: 1, cycle_count: 0 },
    };
    deepStrictEqual(await createCodeIndex(tools).dependencyGraph("L2_Module", 200), {
      nodes: [{ fqn: "a", name: "a", kind: "module" }],
      edges: [{ from: "/a.ts#module@0", to: "/b.ts#module@0", kind: "1" }],
      nodeCount: 2, edgeCount: 1, cycleCount: 0,
    });
    deepStrictEqual(tools.inputsOf("dependencyGraph"), [{ scope: "L2_Module", max_nodes: 200, include_mermaid: false }]);
  });

  it("reads a package summary", async () => {
    const tools = new FakeTools();
    tools.replies.packageSummary = { fqn: "pkg.a", name: "a", file_count: 2, symbol_count: 5, dependencies: ["pkg.b"] };
    deepStrictEqual(await createCodeIndex(tools).packageSummary("pkg.a"), {
      fqn: "pkg.a", name: "a", files: 2, symbols: 5, dependencies: ["pkg.b"],
    });
    deepStrictEqual(tools.inputsOf("packageSummary"), [{ fqn: "pkg.a" }]);
  });

  it("searches in the default hybrid mode, keeping each origin on its hit", async () => {
    const tools = new FakeTools();
    tools.replies.codebaseSearch = {
      hits: [
        { fqn: "", score: 0.05, match_origin: "hybrid" },
        { fqn: "/workspace/src/math.ts::add", score: 0.03, match_origin: "bm25" },
        { fqn: "/workspace/src/index.ts::greet", score: 0.02, match_origin: "vector" },
      ],
    };
    deepStrictEqual(await createCodeIndex(tools).search("add numbers", 8), [
      { fqn: "/workspace/src/math.ts::add", score: 0.03, origin: "bm25" },
      { fqn: "/workspace/src/index.ts::greet", score: 0.02, origin: "vector" },
    ]);
    deepStrictEqual(tools.inputsOf("codebaseSearch"), [{ query: "add numbers", top_k: 8 }]);
  });

  it("locates a symbol from a short source, the requested fqn standing in", async () => {
    const tools = new FakeTools();
    tools.replies.symbolSource = {
      virtual_file_path: "/workspace/src/math.ts", start_line: 4, end_line: 9, language: "typescript",
    };
    deepStrictEqual(await createCodeIndex(tools).symbolSource("/workspace/src/math.ts::add"), {
      fqn: "/workspace/src/math.ts::add", path: "/workspace/src/math.ts",
      startLine: 4, endLine: 9, language: "typescript", firstLine: "",
    });
    deepStrictEqual(tools.inputsOf("symbolSource"), [{ fqn: "/workspace/src/math.ts::add", max_lines: 20 }]);
  });

  it("reads the callers of a symbol, looking backward", async () => {
    const tools = new FakeTools();
    tools.replies.impactAnalysis = {
      target: "pkg.add", direct_impact: ["pkg.sum"], transitive_impact: ["pkg.main"], by_package: { pkg: 2 },
    };
    deepStrictEqual(await createCodeIndex(tools).impact("pkg.add", 2), {
      target: "pkg.add", direct: ["pkg.sum"], transitive: ["pkg.main"], byPackage: { pkg: 2 },
    });
    deepStrictEqual(tools.inputsOf("impactAnalysis"), [{ target: "pkg.add", direction: "Backward", max_depth: 2 }]);
  });

  it("lets a failing search, source or impact reject", async () => {
    const tools = new FakeTools();
    tools.replies.codebaseSearch = new Error("search down");
    tools.replies.symbolSource = new Error("no such symbol");
    tools.replies.impactAnalysis = new Error("impact down");
    const index = createCodeIndex(tools);
    await rejects(index.search("q", 8), /search down/);
    await rejects(index.symbolSource("x"), /no such symbol/);
    await rejects(index.impact("x", 2), /impact down/);
  });

  it("lets a failing tool reject", async () => {
    const tools = new FakeTools();
    tools.replies.indexStatus = new Error("no index tool");
    await rejects(createCodeIndex(tools).rootCount(), /no index tool/);
  });
});

/** A batch_anchors tool answering `reply` (thrown when an Error), its inputs kept in order. */
function anchorTools(reply: unknown): Pick<OrkeonTools, "batchAnchors"> & { inputs: unknown[] } {
  const inputs: unknown[] = [];
  return {
    inputs,
    batchAnchors: async (input) => {
      inputs.push(input);
      if (reply instanceof Error) throw reply;
      return reply as Awaited<ReturnType<OrkeonTools["batchAnchors"]>>;
    },
  };
}

describe("createAnchorIndex", () => {
  it("asks the closure of the anchors and reads its nodes, unresolved anchors and truncation", async () => {
    const tools = anchorTools({ nodes: ["/workspace/b.ts::B"], unresolved: ["/workspace/x.ts::X"], truncated: true, shared: [], disjoint: false });
    deepStrictEqual(await createAnchorIndex(tools).closure(["/workspace/a.ts::A", "/workspace/x.ts::X"]), {
      nodes: ["/workspace/b.ts::B"], unresolved: ["/workspace/x.ts::X"], truncated: true,
    });
    deepStrictEqual(tools.inputs, [{ action: "closure", fqns: ["/workspace/a.ts::A", "/workspace/x.ts::X"] }]);
  });

  it("reads a PascalCase result, and an empty one as no node", async () => {
    deepStrictEqual(await createAnchorIndex(anchorTools({ Nodes: ["n"], Unresolved: [], Truncated: false })).closure(["a"]),
      { nodes: ["n"], unresolved: [], truncated: false });
    deepStrictEqual(await createAnchorIndex(anchorTools({})).closure(["a"]), { nodes: [], unresolved: [], truncated: false });
  });

  it("lets a failing tool reject", async () => {
    await rejects(createAnchorIndex(anchorTools(new Error("anchors down"))).closure(["a"]), /anchors down/);
  });
});

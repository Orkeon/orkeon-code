// The CodeIndex adapter over the FakeTools code-intelligence tools. Run:
//   node_modules/.bin/tsx --test shared/infrastructure/orkeon/code-index.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createCodeIndex } from "./code-index.ts";
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

  it("lets a failing tool reject", async () => {
    const tools = new FakeTools();
    tools.replies.indexStatus = new Error("no index tool");
    await rejects(createCodeIndex(tools).rootCount(), /no index tool/);
  });
});

// The CodeIndex adapter over the FakeTools code-intelligence tools, and the AnchorIndex adapter over a
// batch_anchors stub (FakeTools fakes no batch_anchors). Run:
//   node --test tests/shared/infrastructure/orkeon/code-index.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createAnchorIndex, createCodeIndex, createCostIndex } from "../../../../src/shared/infrastructure/orkeon/code-index.ts";
import { FakeTools } from "../../../support/doubles/fake-tools.ts";
import {
  CLOSURES, COST_REPORT, COST_WITHOUT_REPORT, FAILING_CALLS, FAILURES, GRAPH, GRAPH_REPLY, IMPACT, IMPACT_REPLY,
  INDEX_COUNTS, INDEX_REPLY, MAP_REPLY, PACKAGE, PACKAGE_REPLY, SEARCH_HITS, SEARCH_REPLY, SOURCE, SOURCE_REPLY,
  anchorTools, costTools,
} from "./code-index.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { INDEXED_LANGUAGES } from "../../../../src/shared/domain/index-languages.ts";

describe("createCodeIndex", () => {
  it("counts the indexed roots", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.indexStatus = { roots: [WORKSPACE, "/other"] };

    // Act
    const count = await createCodeIndex(tools).rootCount();

    // Assert
    strictEqual(count, 2);
    deepStrictEqual(tools.inputsOf("indexStatus"), [{}]);
  });

  it("counts no root when the status lists no array", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.indexStatus = { roots: "none" };

    // Act
    const count = await createCodeIndex(tools).rootCount();

    // Assert
    strictEqual(count, 0);
    deepStrictEqual(tools.inputsOf("indexStatus"), [{}]);
  });

  it("indexes a root for every grammar of the registry, and reads the counts", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.indexCodebase = INDEX_REPLY;

    // Act
    const counts = await createCodeIndex(tools).index(WORKSPACE);

    // Assert
    deepStrictEqual(counts, INDEX_COUNTS);
    deepStrictEqual(tools.inputsOf("indexCodebase"), [{ root_path: WORKSPACE, languages: INDEXED_LANGUAGES }]);
  });

  it("asks for max_parallelism only when a parallelism is given", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.indexCodebase = INDEX_REPLY;

    // Act
    await createCodeIndex(tools).index(WORKSPACE, { parallel: 6 });
    await createCodeIndex(tools).index(WORKSPACE, {});

    // Assert
    deepStrictEqual(tools.inputsOf("indexCodebase"), [
      { root_path: WORKSPACE, languages: INDEXED_LANGUAGES, max_parallelism: 6 },
      { root_path: WORKSPACE, languages: INDEXED_LANGUAGES },
    ]);
  });

  it("reads a map's entries and symbol total, asking for metrics when told", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.codebaseMap = MAP_REPLY;

    // Act
    const map = await createCodeIndex(tools).map("L3_Symbol", true);

    // Assert
    deepStrictEqual(map, { entries: [{ fqn: "pkg.F", name: "F", kind: "function" }], symbolCount: 9 });
    deepStrictEqual(tools.inputsOf("codebaseMap"), [{ level: "L3_Symbol", include_metrics: true }]);
  });

  it("asks for a map without metrics when not told", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.codebaseMap = MAP_REPLY;

    // Act
    await createCodeIndex(tools).map("L1_Package", false);

    // Assert
    deepStrictEqual(tools.inputsOf("codebaseMap"), [{ level: "L1_Package" }]);
  });

  it("reads the dependency graph of a scope, without its mermaid rendering", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.dependencyGraph = GRAPH_REPLY;

    // Act
    const graph = await createCodeIndex(tools).dependencyGraph("L2_Module", 200);

    // Assert
    deepStrictEqual(graph, GRAPH);
    deepStrictEqual(tools.inputsOf("dependencyGraph"), [{ scope: "L2_Module", max_nodes: 200, include_mermaid: false }]);
  });

  it("reads a package summary", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.packageSummary = PACKAGE_REPLY;

    // Act
    const summary = await createCodeIndex(tools).packageSummary("pkg.a");

    // Assert
    deepStrictEqual(summary, PACKAGE);
    deepStrictEqual(tools.inputsOf("packageSummary"), [{ fqn: "pkg.a" }]);
  });

  it("searches in the default hybrid mode, keeping each origin on its hit", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.codebaseSearch = SEARCH_REPLY;

    // Act
    const hits = await createCodeIndex(tools).search("add numbers", 8);

    // Assert
    deepStrictEqual(hits, SEARCH_HITS);
    deepStrictEqual(tools.inputsOf("codebaseSearch"), [{ query: "add numbers", top_k: 8 }]);
  });

  it("locates a symbol from a short source, the requested fqn standing in", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.symbolSource = SOURCE_REPLY;

    // Act
    const source = await createCodeIndex(tools).symbolSource(`${WORKSPACE}/src/math.ts::add`);

    // Assert
    deepStrictEqual(source, SOURCE);
    deepStrictEqual(tools.inputsOf("symbolSource"), [{ fqn: `${WORKSPACE}/src/math.ts::add`, max_lines: 20 }]);
  });

  it("reads the callers of a symbol, looking backward", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.impactAnalysis = IMPACT_REPLY;

    // Act
    const impact = await createCodeIndex(tools).impact("pkg.add", 2);

    // Assert
    deepStrictEqual(impact, IMPACT);
    deepStrictEqual(tools.inputsOf("impactAnalysis"), [{ target: "pkg.add", direction: "Backward", max_depth: 2 }]);
  });

  for (const c of FAILING_CALLS) {
    it(c.name, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies[c.tool] = FAILURES[c.tool];

      // Act
      const act = c.call(createCodeIndex(tools));

      // Assert
      await rejects(act, c.message);
    });
  }

  it("asks affected_tests with the paths as given, relative to the indexed root, and reads its answer", async () => {
    // Arrange
    const asked: unknown[] = [];
    const index = createCostIndex({
      ...costTools({}),
      affectedTests: async (input: unknown) => {
        asked.push(input);
        return { all: false, test_projects: ["tests"], test_classes: ["ATests"], unresolved: [] };
      },
    } as Parameters<typeof createCostIndex>[0]);

    // Act
    const affected = await index.affected?.(["src/a.ts", "tests/a.test.ts"]);

    // Assert
    deepStrictEqual(affected, { all: false, projects: ["tests"], classes: ["ATests"], unresolved: [] });
    deepStrictEqual(asked, [{ changed_files: ["src/a.ts", "tests/a.test.ts"] }]);
  });

  it("lets a failing tool reject", async () => {
    // Arrange
    const tools = new FakeTools();
    tools.replies.indexStatus = new Error("no index tool");

    // Act
    const act = createCodeIndex(tools).rootCount();

    // Assert
    await rejects(act, /no index tool/);
  });
});

describe("createAnchorIndex", () => {
  it("asks the closure of the anchors and reads its nodes, unresolved anchors and truncation", async () => {
    // Arrange
    const tools = anchorTools({ nodes: [`${WORKSPACE}/b.ts::B`], unresolved: [`${WORKSPACE}/x.ts::X`], truncated: true, shared: [], disjoint: false });

    // Act
    const closure = await createAnchorIndex(tools).closure([`${WORKSPACE}/a.ts::A`, `${WORKSPACE}/x.ts::X`]);

    // Assert
    deepStrictEqual(closure, { nodes: [`${WORKSPACE}/b.ts::B`], unresolved: [`${WORKSPACE}/x.ts::X`], truncated: true });
    deepStrictEqual(tools.inputs, [{ action: "closure", fqns: [`${WORKSPACE}/a.ts::A`, `${WORKSPACE}/x.ts::X`] }]);
  });

  for (const c of CLOSURES) {
    it(c.name, async () => {
      // Arrange
      const tools = anchorTools(c.reply);

      // Act
      const closure = await createAnchorIndex(tools).closure(["a"]);

      // Assert
      deepStrictEqual(closure, c.expected);
    });
  }

  it("lets a failing tool reject", async () => {
    // Arrange
    const tools = anchorTools(new Error("anchors down"));

    // Act
    const act = createAnchorIndex(tools).closure(["a"]);

    // Assert
    await rejects(act, /anchors down/);
  });
});

describe("createCostIndex", () => {
  it("lists the virtual roots of index_status, objects or names", async () => {
    // Arrange
    const tools = costTools({ indexStatus: { roots: [{ virtual_root: WORKSPACE, node_count: 3 }, "/other", { node_count: 1 }] } });

    // Act
    const roots = await createCostIndex(tools).roots();

    // Assert
    deepStrictEqual(roots, [WORKSPACE, "/other"]);
    deepStrictEqual(tools.calls, [["indexStatus", {}]]);
  });

  it("lists no root without an array", async () => {
    // Arrange
    const tools = costTools({ indexStatus: { roots: "none" } });

    // Act
    const roots = await createCostIndex(tools).roots();

    // Assert
    deepStrictEqual(roots, []);
  });

  it("refreshes the files under the root and hands back the tool's errors", async () => {
    // Arrange
    const tools = costTools({ incrementalReindex: { errors: ["bad file"], node_count: 0 } });

    // Act
    const errors = await createCostIndex(tools).refresh(WORKSPACE, [`${WORKSPACE}/src/a.ts`]);

    // Assert
    deepStrictEqual(errors, ["bad file"]);
    deepStrictEqual(tools.calls, [["incrementalReindex", { root_path: WORKSPACE, changed_files: [`${WORKSPACE}/src/a.ts`] }]]);
  });

  it("asks access_cost for the files, no receivers when none is given, and reads the report", async () => {
    // Arrange
    const tools = costTools({ accessCost: { report: COST_REPORT, errors: [] } });

    // Act
    const answer = await createCostIndex(tools).accessCost([`${WORKSPACE}/src/a.ts`], undefined);

    // Assert
    deepStrictEqual(answer.errors, []);
    deepStrictEqual(answer.report?.members[0].portCalls, [{ receiver: "this.store", method: "save", line: 4, inLoop: true, inLambda: false }]);
    deepStrictEqual(tools.calls.map((c) => c[1]), [{ changed_files: [`${WORKSPACE}/src/a.ts`] }]);
  });

  it("asks access_cost for the receivers when given", async () => {
    // Arrange
    const tools = costTools({ accessCost: { report: COST_REPORT, errors: [] } });

    // Act
    await createCostIndex(tools).accessCost([`${WORKSPACE}/src/a.ts`], "gateway");

    // Assert
    deepStrictEqual(tools.calls.map((c) => c[1]), [{ changed_files: [`${WORKSPACE}/src/a.ts`], receivers: "gateway" }]);
  });

  for (const c of COST_WITHOUT_REPORT) {
    it(c.name, async () => {
      // Arrange
      const index = createCostIndex(costTools({ accessCost: c.reply }));

      // Act
      const answer = await index.accessCost(c.files, undefined);

      // Assert
      deepStrictEqual(answer, c.expected);
    });
  }

  it("lets a failing tool reject", async () => {
    // Arrange
    const index = createCostIndex(costTools({ indexStatus: new Error("index down") }));

    // Act
    const act = index.roots();

    // Assert
    await rejects(act, /index down/);
  });
});

// The code-intelligence replies the CodeIndex, AnchorIndex and CostIndex tests read, what they read from them, and
// the stand-ins of the tools FakeTools does not fake (batch_anchors, incremental_reindex, access_cost).
import type { createCodeIndex } from "../../../../src/shared/infrastructure/orkeon/code-index.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

type CodeIndex = ReturnType<typeof createCodeIndex>;

export const INDEX_REPLY = { file_count: 12, node_count: 40, edge_count: 7, statement_count: 3, errors: ["x"] };
export const INDEX_COUNTS = { files: 12, nodes: 40, edges: 7, statements: 3, errors: ["x"] };

export const MAP_REPLY = { entries: [{ fqn: "pkg.F", name: "F", kind: "function" }, { name: "no fqn" }], totals: { symbol_count: 9 } };

export const GRAPH_REPLY = {
  nodes: [{ fqn: "a", name: "a", kind: "module" }],
  edges: [{ from: "/a.ts#module@0", to: "/b.ts#module@0", kind: 1 }],
  metrics: { node_count: 2, edge_count: 1, cycle_count: 0 },
};

export const GRAPH = {
  nodes: [{ fqn: "a", name: "a", kind: "module" }],
  edges: [{ from: "/a.ts#module@0", to: "/b.ts#module@0", kind: "1" }],
  nodeCount: 2, edgeCount: 1, cycleCount: 0,
};

export const PACKAGE_REPLY = { fqn: "pkg.a", name: "a", file_count: 2, symbol_count: 5, dependencies: ["pkg.b"] };
export const PACKAGE = { fqn: "pkg.a", name: "a", files: 2, symbols: 5, dependencies: ["pkg.b"] };

/** Three hits, the first without a fqn, each from another origin. */
export const SEARCH_REPLY = {
  hits: [
    { fqn: "", score: 0.05, match_origin: "hybrid" },
    { fqn: `${WORKSPACE}/src/math.ts::add`, score: 0.03, match_origin: "bm25" },
    { fqn: `${WORKSPACE}/src/index.ts::greet`, score: 0.02, match_origin: "vector" },
  ],
};

export const SEARCH_HITS = [
  { fqn: `${WORKSPACE}/src/math.ts::add`, score: 0.03, origin: "bm25" },
  { fqn: `${WORKSPACE}/src/index.ts::greet`, score: 0.02, origin: "vector" },
];

/** A short source: no fqn nor first line in the reply. */
export const SOURCE_REPLY = { virtual_file_path: `${WORKSPACE}/src/math.ts`, start_line: 4, end_line: 9, language: "typescript" };

export const SOURCE = {
  fqn: `${WORKSPACE}/src/math.ts::add`, path: `${WORKSPACE}/src/math.ts`,
  startLine: 4, endLine: 9, language: "typescript", firstLine: "",
};

export const IMPACT_REPLY = { target: "pkg.add", direct_impact: ["pkg.sum"], transitive_impact: ["pkg.main"], by_package: { pkg: 2 } };
export const IMPACT = { target: "pkg.add", direct: ["pkg.sum"], transitive: ["pkg.main"], byPackage: { pkg: 2 } };

export interface FailingCallCase {
  name: string;
  tool: "codebaseSearch" | "symbolSource" | "impactAnalysis";
  call: (index: CodeIndex) => Promise<unknown>;
  message: RegExp;
}

/** A failing search, source or impact: each rejects with its tool's error. */
export const FAILING_CALLS: readonly FailingCallCase[] = [
  { name: "lets a failing search reject", tool: "codebaseSearch", call: (index) => index.search("q", 8), message: /search down/ },
  { name: "lets a failing symbol source reject", tool: "symbolSource", call: (index) => index.symbolSource("x"), message: /no such symbol/ },
  { name: "lets a failing impact reject", tool: "impactAnalysis", call: (index) => index.impact("x", 2), message: /impact down/ },
];

/** The errors the failing calls throw. */
export const FAILURES = {
  codebaseSearch: new Error("search down"),
  symbolSource: new Error("no such symbol"),
  impactAnalysis: new Error("impact down"),
};

/** A batch_anchors tool answering `reply` (thrown when an Error), its inputs kept in order. */
export function anchorTools(reply: unknown): Pick<OrkeonTools, "batchAnchors"> & { inputs: unknown[] } {
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

export interface ClosureCase {
  name: string;
  reply: unknown;
  expected: unknown;
}

/** Closures read from a PascalCase result and from an empty one. */
export const CLOSURES: readonly ClosureCase[] = [
  { name: "reads a PascalCase result", reply: { Nodes: ["n"], Unresolved: [], Truncated: false }, expected: { nodes: ["n"], unresolved: [], truncated: false } },
  { name: "reads an empty result as no node", reply: {}, expected: { nodes: [], unresolved: [], truncated: false } },
];

type CostTools = "indexStatus" | "incrementalReindex" | "accessCost";

/** The three tools of the access cost, each answering its reply (thrown when an Error), their calls kept in order. */
export function costTools(replies: Partial<Record<CostTools, unknown>>): Pick<OrkeonTools, CostTools> & { calls: Array<[CostTools, unknown]> } {
  const calls: Array<[CostTools, unknown]> = [];
  const answer = async (tool: CostTools, input: unknown): Promise<any> => {
    calls.push([tool, input]);
    const reply = replies[tool];
    if (reply instanceof Error) throw reply;
    return reply ?? {};
  };
  return {
    calls,
    indexStatus: (input) => answer("indexStatus", input),
    incrementalReindex: (input) => answer("incrementalReindex", input),
    accessCost: (input) => answer("accessCost", input),
  };
}

/** An access_cost report of one member calling a port in a loop. */
export const COST_REPORT = {
  members: [{
    member: `${WORKSPACE}/src/a.ts::A::run`,
    port_calls: [{ receiver: "this.store", method: "save", line: 4, in_loop: true, in_lambda: false }],
    in_memory_filters: [],
    cost: { reads: 0, writes: 0, loops: 1, lambdas: 0, memory_filters: 0 },
  }],
  cost: { reads: 0, writes: 0, loops: 1, lambdas: 0, memory_filters: 0 },
};

export interface CostAnswerCase {
  name: string;
  reply: unknown;
  files: string[];
  expected: unknown;
}

/** access_cost answers that carry no report the index can read. */
export const COST_WITHOUT_REPORT: readonly CostAnswerCase[] = [
  { name: "hands back the errors without a report", reply: { errors: ["Provide fqns"] }, files: [], expected: { report: null, errors: ["Provide fqns"] } },
  { name: "reads a report it cannot read as none", reply: { report: { members: "x" }, errors: [] }, files: ["a"], expected: { report: null, errors: [] } },
];

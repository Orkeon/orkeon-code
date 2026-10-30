// The code index, progress and model fakes runAnalyze is tested over.
import { renderHarvest } from "../../../../src/crews/analyze/domain/harvest.ts";
import type { GraphSummary, IndexSummary, PackageSummary } from "../../../../src/shared/domain/code-intel-contract.ts";
import { FakeCodeIndex } from "../../../support/doubles/fake-code-index.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeProgress } from "../../../support/doubles/fake-progress.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const GRAPH: GraphSummary = {
  nodes: [{ fqn: "a", name: "a", kind: "module" }],
  edges: [{ from: "/a.ts#module@0", to: "/b.ts#module@0", kind: "1" }],
  nodeCount: 2, edgeCount: 1, cycleCount: 0,
};
export const SYMBOLS = [{ fqn: "pkg.a.F", name: "F", kind: "function" }];
export const summary = (fqn: string): PackageSummary => ({ fqn, name: fqn, files: 2, symbols: 5, dependencies: [] });

/** An index already built, holding `packageCount` packages; a model answering "the synthesis". */
export function analyzeSetup(packageCount = 1) {
  const index = new FakeCodeIndex();
  index.roots = 1;
  const fqns = Array.from({ length: packageCount }, (_, i) => `pkg.p${i}`);
  index.maps.L1_Package = { entries: fqns.map((fqn) => ({ fqn, name: fqn, kind: "package" })), symbolCount: 0 };
  index.maps.L3_Symbol = { entries: SYMBOLS, symbolCount: 7 };
  index.graph = GRAPH;
  for (const fqn of fqns) index.packages[fqn] = summary(fqn);
  const progress = new FakeProgress();
  const llm = new FakeLlm();
  llm.answers = ["the synthesis"];
  const log = new FakeLogger();
  return { index, progress, llm, log, fqns, deps: { index, progress, llm, log } };
}

/** The harvest rendered from the packages `fqns`, GRAPH and SYMBOLS. */
export const harvestOf = (fqns: string[]) =>
  renderHarvest({ packages: fqns.map(summary), moduleGraph: GRAPH, symbols: SYMBOLS, symbolCount: 7 });

/** The index calls of a raw run over one package. */
export const RAW_RUN_CALLS = [
  "rootCount", "map L1_Package false", "map L3_Symbol true", "dependencyGraph L2_Module 200", "packageSummary pkg.p0",
];

export const NOTHING_INDEXED = `analyze: indexed 0 file(s) under ${WORKSPACE} — nothing to analyze ` +
  "(no file matches the Tree-sitter adapters' extensions).";

/** The indexing line for each outcome of the index cache (Orkeon #244), over 12 files and 40 nodes. */
export const CACHE_LINES: readonly { readonly name: string; readonly indexed: IndexSummary; readonly line: string }[] = [
  { name: "no cache, a runtime before #244", indexed: { files: 12, nodes: 40, edges: 0, statements: 0, errors: [] },
    line: "info: analyze: indexed 12 file(s), 40 node(s)" },
  { name: "a hit", indexed: { files: 12, nodes: 40, edges: 0, statements: 0, errors: [], cache: "hit", reindexed: 0 },
    line: "info: analyze: indexed 12 file(s), 40 node(s); cache hit: the index an earlier session saved, no file changed" },
  { name: "a refresh", indexed: { files: 12, nodes: 40, edges: 0, statements: 0, errors: [], cache: "refreshed", reindexed: 3 },
    line: "info: analyze: indexed 12 file(s), 40 node(s); cache refreshed: 3 changed file(s) reindexed" },
  { name: "a miss", indexed: { files: 12, nodes: 40, edges: 0, statements: 0, errors: [], cache: "miss", reindexed: 0 },
    line: "info: analyze: indexed 12 file(s), 40 node(s); cache miss: built, then saved" },
  { name: "a rebuild", indexed: { files: 12, nodes: 40, edges: 0, statements: 0, errors: [], cache: "bypassed", reindexed: 0 },
    line: "info: analyze: indexed 12 file(s), 40 node(s); cache bypassed: rebuilt, then saved" },
  { name: "an outcome this version does not know", indexed: { files: 12, nodes: 40, edges: 0, statements: 0, errors: [], cache: "partial", reindexed: 0 },
    line: "info: analyze: indexed 12 file(s), 40 node(s); cache partial" },
];

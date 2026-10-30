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
export const summary = (fqn: string): PackageSummary =>
  ({ fqn, name: fqn, files: 2, symbols: 5, dependencies: [], exports: [`${fqn}/a.ts::F`], entryPoints: [] });

/** An index already built, holding `packageCount` packages of one size; a model answering "the synthesis". */
export function analyzeSetup(packageCount = 1) {
  const index = new FakeCodeIndex();
  index.roots = 1;
  const fqns = Array.from({ length: packageCount }, (_, i) => `pkg.p${i}`);
  index.maps.L1_Package = { entries: fqns.map((fqn) => ({ fqn, name: fqn, kind: "package", children: 3 })), symbolCount: 0 };
  index.graph = GRAPH;
  for (const fqn of fqns) index.packages[fqn] = summary(fqn);
  const progress = new FakeProgress();
  const llm = new FakeLlm();
  llm.answers = ["the synthesis"];
  const log = new FakeLogger();
  return { index, progress, llm, log, fqns, deps: { index, progress, llm, log } };
}

/** The harvest rendered from the packages `fqns` (the first `summarized` of them summarized) and GRAPH. */
export const harvestOf = (fqns: string[], summarized = fqns.length) => renderHarvest({
  packages: fqns.slice(0, summarized).map(summary),
  unsummarized: fqns.slice(summarized).map((fqn) => ({ fqn, name: fqn, kind: "package", children: 3 })),
  moduleGraph: GRAPH,
  graphCap: 200,
  mapCap: 1000,
});

/** The index calls of a raw run over one package. */
export const RAW_RUN_CALLS = [
  "rootCount", "map L1_Package false 1000", "dependencyGraph L2_Module 200", "packageSummary pkg.p0",
];

/** An L1 map in the store's order: a small template folder, the tests, then the code. */
export const UNRANKED_L1 = [
  { fqn: "pkg.templates", name: "templates", kind: "package", children: 1 },
  { fqn: "pkg.Core.Tests", name: "Core.Tests", kind: "package", children: 50 },
  { fqn: "pkg.Core", name: "Core", kind: "package", children: 20 },
];

/** The packages summarized from UNRANKED_L1, in order. */
export const RANKED_SUMMARIES = ["packageSummary pkg.Core", "packageSummary pkg.templates", "packageSummary pkg.Core.Tests"];

export const NOTHING_INDEXED = `analyze: indexed 0 file(s) under ${WORKSPACE} — nothing to analyze ` +
  "(no file matches the Tree-sitter adapters' extensions).";

/** The indexing line without the cache and with it (Orkeon #244), over 12 files and 40 nodes. */
export const CACHE_LINES: readonly { readonly name: string; readonly indexed: IndexSummary; readonly line: string }[] = [
  { name: "no cache, a runtime before #244", indexed: { files: 12, nodes: 40, edges: 0, statements: 0, errors: [] },
    line: "info: analyze: indexed 12 file(s), 40 node(s)" },
  { name: "a refresh", indexed: { files: 12, nodes: 40, edges: 0, statements: 0, errors: [], cache: "refreshed", reindexed: 3 },
    line: "info: analyze: indexed 12 file(s), 40 node(s); cache refreshed: 3 changed file(s) reindexed" },
];

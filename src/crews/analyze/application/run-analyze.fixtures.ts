// The code index, progress and model fakes runAnalyze is tested over.
import { renderHarvest } from "../domain/harvest.ts";
import type { GraphSummary, PackageSummary } from "../../../shared/domain/code-intel-contract.ts";
import { FakeCodeIndex } from "../../../../tests/support/fake-code-index.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeProgress } from "../../../../tests/support/fake-progress.ts";

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

export const NOTHING_INDEXED = "analyze: indexed 0 file(s) under /workspace — nothing to analyze " +
  "(no file matches the Tree-sitter adapters' extensions).";

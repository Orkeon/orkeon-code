// The /analyze use case over FakeCodeIndex, FakeProgress and FakeLlm. Run:
//   node --test src/crews/analyze/application/run-analyze.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { MAX_PACKAGES, PROGRESS_LABEL, runAnalyze } from "./run-analyze.ts";
import { SYNTHESIS_SYSTEM, buildSynthesisUser, renderHarvest } from "../domain/harvest.ts";
import type { GraphSummary, PackageSummary } from "../../../shared/domain/code-intel-contract.ts";
import { FakeCodeIndex } from "../../../../tests/support/fake-code-index.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeProgress } from "../../../../tests/support/fake-progress.ts";

const GRAPH: GraphSummary = {
  nodes: [{ fqn: "a", name: "a", kind: "module" }],
  edges: [{ from: "/a.ts#module@0", to: "/b.ts#module@0", kind: "1" }],
  nodeCount: 2, edgeCount: 1, cycleCount: 0,
};
const SYMBOLS = [{ fqn: "pkg.a.F", name: "F", kind: "function" }];
const summary = (fqn: string): PackageSummary => ({ fqn, name: fqn, files: 2, symbols: 5, dependencies: [] });

/** An index already built, holding `packageCount` packages. */
function setup(packageCount = 1) {
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

const harvestOf = (fqns: string[]) =>
  renderHarvest({ packages: fqns.map(summary), moduleGraph: GRAPH, symbols: SYMBOLS, symbolCount: 7 });

describe("runAnalyze", () => {
  it("returns the raw harvest of an existing index, without indexing or synthesis", async () => {
    const { index, progress, llm, fqns, deps } = setup();
    strictEqual(await runAnalyze({ raw: "true" }, deps), harvestOf(fqns));
    deepStrictEqual(index.calls, [
      "rootCount", "map L1_Package false", "map L3_Symbol true", "dependencyGraph L2_Module 200", "packageSummary pkg.p0",
    ]);
    deepStrictEqual(llm.acts, []);
    deepStrictEqual(progress.reports.map((r) => r.step), [1, 2, 3, 4]);
    deepStrictEqual(progress.released, [PROGRESS_LABEL]);
  });

  it("indexes the workspace first when the index is empty, and stops when it found nothing", async () => {
    const { index, progress, deps } = setup();
    index.roots = 0;
    const out = await runAnalyze({}, deps);
    strictEqual(out, "analyze: indexed 0 file(s) under /workspace — nothing to analyze " +
      "(no file matches the Tree-sitter adapters' extensions).");
    deepStrictEqual(index.calls, ["rootCount", "index /workspace"]);
    deepStrictEqual(progress.released, [PROGRESS_LABEL]);
  });

  it("synthesizes the harvest in one tool-less call, packages capped", async () => {
    const { index, llm, log, fqns, deps } = setup(MAX_PACKAGES + 2);
    index.roots = 0;
    index.indexed = { files: 12, nodes: 40, edges: 0, statements: 0, errors: [] };
    strictEqual(await runAnalyze({ raw: false }, deps), "the synthesis");
    deepStrictEqual(index.calls.filter((c) => c.startsWith("packageSummary")).length, MAX_PACKAGES);
    deepStrictEqual(llm.acts, [{
      prompt: buildSynthesisUser(harvestOf(fqns.slice(0, MAX_PACKAGES))),
      request: { system: SYNTHESIS_SYSTEM, maxIterations: 1 },
    }]);
    deepStrictEqual(log.lines, [
      "info: analyze: indexed 12 file(s), 40 node(s)",
      "warn: analyze: 2 package(s) beyond the cap of 10 not summarized",
    ]);
  });

  it("releases the progress slot when the index fails", async () => {
    const { index, progress, deps } = setup();
    index.failure = new Error("no index tool");
    await rejects(runAnalyze({}, deps), /no index tool/);
    deepStrictEqual(progress.released, [PROGRESS_LABEL]);
  });
});

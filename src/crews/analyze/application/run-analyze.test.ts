// The /analyze use case over FakeCodeIndex, FakeProgress and FakeLlm. Run:
//   node --test src/crews/analyze/application/run-analyze.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { MAX_PACKAGES, PROGRESS_LABEL, runAnalyze } from "./run-analyze.ts";
import { SYNTHESIS_SYSTEM, buildSynthesisUser } from "../domain/harvest.ts";
import { NOTHING_INDEXED, RAW_RUN_CALLS, analyzeSetup, harvestOf } from "./run-analyze.fixtures.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("runAnalyze", () => {
  it("returns the raw harvest of an existing index, without indexing or synthesis", async () => {
    // Arrange
    const { index, progress, llm, fqns, deps } = analyzeSetup();

    // Act
    const out = await runAnalyze({ raw: "true" }, deps);

    // Assert
    strictEqual(out, harvestOf(fqns));
    deepStrictEqual(index.calls, RAW_RUN_CALLS);
    deepStrictEqual(llm.acts, []);
    deepStrictEqual(progress.reports.map((r) => r.step), [1, 2, 3, 4]);
    deepStrictEqual(progress.released, [PROGRESS_LABEL]);
  });

  it("indexes the workspace first when the index is empty, and stops when it found nothing", async () => {
    // Arrange
    const { index, progress, deps } = analyzeSetup();
    index.roots = 0;

    // Act
    const out = await runAnalyze({}, deps);

    // Assert
    strictEqual(out, NOTHING_INDEXED);
    deepStrictEqual(index.calls, ["rootCount", `index ${WORKSPACE}`]);
    deepStrictEqual(progress.released, [PROGRESS_LABEL]);
  });

  it("synthesizes the harvest in one tool-less call, packages capped", async () => {
    // Arrange
    const { index, llm, log, fqns, deps } = analyzeSetup(MAX_PACKAGES + 2);
    index.roots = 0;
    index.indexed = { files: 12, nodes: 40, edges: 0, statements: 0, errors: [] };

    // Act
    const out = await runAnalyze({ raw: false }, deps);

    // Assert
    strictEqual(out, "the synthesis");
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
    // Arrange
    const { index, progress, deps } = analyzeSetup();
    index.failure = new Error("no index tool");

    // Act
    const act = runAnalyze({}, deps);

    // Assert
    await rejects(act, /no index tool/);
    deepStrictEqual(progress.released, [PROGRESS_LABEL]);
  });
});

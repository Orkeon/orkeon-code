// The /analyze use case over FakeCodeIndex, FakeProgress and FakeLlm. Run:
//   node --test tests/crews/analyze/application/run-analyze.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { MAX_PACKAGES, PROGRESS_LABEL, runAnalyze } from "../../../../src/crews/analyze/application/run-analyze.ts";
import { SYNTHESIS_SYSTEM, buildSynthesisUser } from "../../../../src/crews/analyze/domain/harvest.ts";
import { CACHE_LINES, NOTHING_INDEXED, RAW_RUN_CALLS, analyzeSetup, harvestOf } from "./run-analyze.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

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

  for (const c of CACHE_LINES) {
    it(`says what the index cache did on the indexing line: ${c.name}`, async () => {
      // Arrange
      const { index, log, deps } = analyzeSetup();
      index.roots = 0;
      index.indexed = c.indexed;

      // Act
      await runAnalyze({ raw: true }, deps);

      // Assert
      strictEqual(log.lines[0], c.line);
    });
  }

  it("hands the indexing the parallelism asked for, as a number or its text", async () => {
    for (const parallel of [4, "4"]) {
      // Arrange
      const { index, deps } = analyzeSetup();
      index.roots = 0;

      // Act
      await runAnalyze({ parallel }, deps);

      // Assert
      deepStrictEqual(index.calls, ["rootCount", `index ${WORKSPACE} parallel=4`]);
    }
  });

  it("leaves the runtime's default parallelism when none, or no whole number of at least 1, is asked", async () => {
    for (const parallel of [undefined, 0, -2, 2.5, "x", ""]) {
      // Arrange
      const { index, deps } = analyzeSetup();
      index.roots = 0;

      // Act
      await runAnalyze({ parallel }, deps);

      // Assert
      deepStrictEqual(index.calls, ["rootCount", `index ${WORKSPACE}`]);
    }
  });

  it("indexes again from scratch on rebuild, even when the session holds an index", async () => {
    for (const rebuild of [true, "true"]) {
      // Arrange
      const { index, deps } = analyzeSetup();
      index.roots = 1;

      // Act
      await runAnalyze({ rebuild, parallel: 2 }, deps);

      // Assert
      deepStrictEqual(index.calls.slice(0, 1), [`index ${WORKSPACE} parallel=2 rebuild`]);
    }
  });

  it("keeps the session's index when rebuild is not asked", async () => {
    for (const rebuild of [undefined, false, "false", "x"]) {
      // Arrange
      const { index, deps } = analyzeSetup();
      index.roots = 1;

      // Act
      await runAnalyze({ rebuild }, deps);

      // Assert
      deepStrictEqual(index.calls.filter((c) => c.startsWith("index ")), []);
    }
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

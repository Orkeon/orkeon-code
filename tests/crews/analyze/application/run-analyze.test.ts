// The /analyze use case over FakeCodeIndex, FakeProgress and FakeLlm. Run:
//   node --test tests/crews/analyze/application/run-analyze.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { MAX_PACKAGES, MAX_SCANNED_PACKAGES, PROGRESS_LABEL, runAnalyze } from "../../../../src/crews/analyze/application/run-analyze.ts";
import { SYNTHESIS_SYSTEM, buildSynthesisUser } from "../../../../src/crews/analyze/domain/harvest.ts";
import {
  CACHE_LINES, NOTHING_INDEXED, PARALLEL_ABSENT, PARALLEL_ASKED, PARALLEL_REFUSED, RANKED_SUMMARIES, RAW_RUN_CALLS,
  REBUILD_ASKED, REBUILD_NOT_ASKED, UNRANKED_L1, analyzeSetup, harvestOf, withSmallHost,
} from "./run-analyze.fixtures.ts";
import { assertDefaultIndexing } from "./run-analyze.assertions.ts";
import { assertMentions } from "../../../support/assertions/text.ts";
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

  it("synthesizes the harvest in one tool-less call, every package read and the summaries capped", async () => {
    // Arrange
    const { index, llm, log, fqns, deps } = analyzeSetup(MAX_PACKAGES + 2);
    index.roots = 0;
    index.indexed = { files: 12, nodes: 40, edges: 0, statements: 0, errors: [] };

    // Act
    const out = await runAnalyze({ raw: false }, deps);

    // Assert
    strictEqual(out, "the synthesis");
    deepStrictEqual(index.calls.filter((c) => c.startsWith("packageSummary")).length, fqns.length);
    deepStrictEqual(llm.acts, [{
      prompt: buildSynthesisUser(harvestOf(fqns, MAX_PACKAGES)),
      request: { system: SYNTHESIS_SYSTEM, maxIterations: 1 },
    }]);
    deepStrictEqual(log.lines, [
      "info: analyze: indexed 12 file(s), 40 node(s)",
      `warn: analyze: 2 package(s) beyond the cap of ${MAX_PACKAGES} not summarized`,
    ]);
  });

  it("writes the synthesis in the language the input names", async () => {
    // Arrange
    const { llm, fqns, deps } = analyzeSetup(MAX_PACKAGES);

    // Act
    await runAnalyze({ raw: false, language: "French" }, deps);

    // Assert
    strictEqual(llm.acts[0]?.prompt, buildSynthesisUser(harvestOf(fqns, MAX_PACKAGES), "French"));
  });

  it("summarizes the largest packages first and the tests last, not the index's first ones", async () => {
    // Arrange
    const { index, deps } = analyzeSetup();
    index.maps.L1_Package = { entries: UNRANKED_L1, symbolCount: 0 };

    // Act
    await runAnalyze({ raw: true }, deps);

    // Assert
    deepStrictEqual(index.calls.filter((c) => c.startsWith("packageSummary")), RANKED_SUMMARIES);
  });

  it("summarizes a small package with an entry module that nothing depends on", async () => {
    // Arrange
    const { index, deps } = analyzeSetup();
    const host = withSmallHost(index);

    // Act
    const out = await runAnalyze({ raw: true }, deps);

    // Assert
    assertMentions(out, [`### \`${host}\``]);
  });

  it(`reads ${MAX_SCANNED_PACKAGES} packages at most, and says how many it left unread`, async () => {
    // Arrange
    const { index, log, deps } = analyzeSetup(MAX_SCANNED_PACKAGES + 3);

    // Act
    await runAnalyze({ raw: true }, deps);

    // Assert
    strictEqual(index.calls.filter((c) => c.startsWith("packageSummary")).length, MAX_SCANNED_PACKAGES);
    assertMentions(log.lines.join("\n"), [`warn: analyze: 3 package(s) beyond the cap of ${MAX_SCANNED_PACKAGES} not read`]);
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

  for (const c of PARALLEL_ASKED) {
    it(`hands the indexing the parallelism asked for: ${c.name}`, async () => {
      // Arrange
      const { index, deps } = analyzeSetup();
      index.roots = 0;

      // Act
      await runAnalyze({ parallel: c.value }, deps);

      // Assert
      deepStrictEqual(index.calls, ["rootCount", `index ${WORKSPACE} parallel=4`]);
    });
  }

  for (const c of PARALLEL_ABSENT) {
    it(`leaves the runtime's default parallelism without a warning when none is asked: ${c.name}`, async () => {
      // Arrange
      const { index, log, deps } = analyzeSetup();
      index.roots = 0;

      // Act
      await runAnalyze({ parallel: c.value }, deps);

      // Assert
      assertDefaultIndexing(index.calls, log.lines, []);
    });
  }

  for (const c of PARALLEL_REFUSED) {
    it(`leaves the runtime's default parallelism and warns when no whole number of at least 1 is asked: ${c.name}`, async () => {
      // Arrange
      const { index, log, deps } = analyzeSetup();
      index.roots = 0;

      // Act
      await runAnalyze({ parallel: c.value }, deps);

      // Assert
      assertDefaultIndexing(index.calls, log.lines, [c.line]);
    });
  }

  for (const c of REBUILD_ASKED) {
    it(`indexes again from scratch on rebuild, even when the session holds an index: ${c.name}`, async () => {
      // Arrange
      const { index, deps } = analyzeSetup();
      index.roots = 1;

      // Act
      await runAnalyze({ rebuild: c.value, parallel: 2 }, deps);

      // Assert
      deepStrictEqual(index.calls.slice(0, 1), [`index ${WORKSPACE} parallel=2 rebuild`]);
    });
  }

  for (const c of REBUILD_NOT_ASKED) {
    it(`keeps the session's index when rebuild is not asked: ${c.name}`, async () => {
      // Arrange
      const { index, deps } = analyzeSetup();
      index.roots = 1;

      // Act
      await runAnalyze({ rebuild: c.value }, deps);

      // Assert
      deepStrictEqual(index.calls.filter((c) => c.startsWith("index ")), []);
    });
  }

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

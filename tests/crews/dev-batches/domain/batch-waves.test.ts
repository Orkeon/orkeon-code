// The waves of a plan's open batches: dependencies first, disjoint anchors side by side, a shared path or
// a batch anchoring nothing waits, a cycle or an unknown dependency refused; the paths a sheet anchors. Run:
//   node --test tests/crews/dev-batches/domain/batch-waves.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { barePath, batchWaves, sheetAnchorPaths } from "../../../../src/crews/dev-batches/domain/batch-waves.ts";
import { NO_ANCHOR_PLANS, REFUSED_PLANS, SHEET, SHEET_ANCHOR_PATHS, b, makefileSheet } from "./batch-waves.fixtures.ts";
import { assertWavesRefused } from "./batch-waves.assertions.ts";

describe("batchWaves", () => {
  it("puts batches with disjoint anchors in one wave, by batch number (F2 before F10)", () => {
    // Arrange
    const plan = [b("F10", ["src/c.ts"]), b("F1", ["src/a.ts"]), b("F2", ["src/b.ts"])];

    // Act
    const waves = batchWaves(plan);

    // Assert
    deepStrictEqual(waves, { ok: true, waves: [["F1", "F2", "F10"]] });
  });

  it("delays a batch that shares a path with one already in the wave, a :line and ./ compared bare", () => {
    // Arrange
    const plan = [b("F1", ["src/a.ts:12", "src/b.ts"]), b("F2", ["./src/a.ts"]), b("F3", ["src/c.ts"])];

    // Act
    const waves = batchWaves(plan);

    // Assert
    deepStrictEqual(waves, { ok: true, waves: [["F1", "F3"], ["F2"]] });
  });

  it("runs a batch after its dependencies' wave; a done batch is a met dependency and in no wave", () => {
    // Arrange
    const plan = [b("F1", ["a"], [], true), b("F2", ["b"], ["F1"]), b("F3", ["c"], ["F2"]), b("F4", ["d"])];

    // Act
    const waves = batchWaves(plan);

    // Assert
    deepStrictEqual(waves, { ok: true, waves: [["F2", "F4"], ["F3"]] });
  });

  for (const c of NO_ANCHOR_PLANS) {
    it(c.name, () => {
      // Arrange
      const plan = c.plan;

      // Act
      const waves = batchWaves(plan);

      // Assert
      deepStrictEqual(waves, { ok: true, waves: c.waves });
    });
  }

  for (const c of REFUSED_PLANS) {
    it(c.name, () => {
      // Arrange
      const plan = c.plan;

      // Act
      const waves = batchWaves(plan);

      // Assert
      assertWavesRefused(waves);
    });
  }

  it("has no wave when every batch is done", () => {
    // Arrange
    const plan = [b("F1", ["a"], [], true)];

    // Act
    const waves = batchWaves(plan);

    // Assert
    deepStrictEqual(waves, { ok: true, waves: [] });
  });
});

describe("sheetAnchorPaths", () => {
  it("reads every column of ## Anchors, bare and unique, a member or a note no path", () => {
    // Arrange
    const sheet = SHEET;

    // Act
    const paths = sheetAnchorPaths(sheet);

    // Assert
    deepStrictEqual(paths, SHEET_ANCHOR_PATHS);
  });

  it("keeps a path without a slash or an extension (Makefile)", () => {
    // Arrange
    const sheet = makefileSheet("F1");

    // Act
    const paths = sheetAnchorPaths(sheet);

    // Assert
    ok(paths.includes("Makefile"), `Makefile missing from ${JSON.stringify(paths)}`);
  });

  it("makes two batches anchoring Makefile share it", () => {
    // Arrange
    const plan = [b("F1", sheetAnchorPaths(makefileSheet("F1"))), b("F2", sheetAnchorPaths(makefileSheet("F2")))];

    // Act
    const waves = batchWaves(plan);

    // Assert
    deepStrictEqual(waves, { ok: true, waves: [["F1"], ["F2"]] });
  });

  it("cuts ./ and a :line", () => {
    // Arrange
    const path = "./src/a.ts:40";

    // Act
    const bare = barePath(path);

    // Assert
    strictEqual(bare, "src/a.ts");
  });
});

// The waves of a plan's open batches: dependencies first, disjoint anchors side by side, a shared path or
// a batch anchoring nothing waits, a cycle or an unknown dependency refused; the paths a sheet anchors. Run:
//   node --test src/crews/dev-batches/domain/batch-waves.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { barePath, batchWaves, sheetAnchorPaths } from "./batch-waves.ts";
import type { WaveBatch } from "./batch-waves.ts";

const SHEET = readFileSync(new URL("../../../../tests/fixtures/dev/plan/expected/PRUNE-PLAN-F1.md", import.meta.url), "utf8");
const b = (id: string, anchors: string[], dependsOn: string[] = [], done = false): WaveBatch => ({ id, dependsOn, anchors, done });

describe("batchWaves", () => {
  it("puts batches with disjoint anchors in one wave, by batch number (F2 before F10)", () => {
    deepStrictEqual(batchWaves([b("F10", ["src/c.ts"]), b("F1", ["src/a.ts"]), b("F2", ["src/b.ts"])]),
      { ok: true, waves: [["F1", "F2", "F10"]] });
  });

  it("delays a batch that shares a path with one already in the wave, a :line and ./ compared bare", () => {
    deepStrictEqual(batchWaves([b("F1", ["src/a.ts:12", "src/b.ts"]), b("F2", ["./src/a.ts"]), b("F3", ["src/c.ts"])]),
      { ok: true, waves: [["F1", "F3"], ["F2"]] });
  });

  it("runs a batch after its dependencies' wave; a done batch is a met dependency and in no wave", () => {
    deepStrictEqual(batchWaves([b("F1", ["a"], [], true), b("F2", ["b"], ["F1"]), b("F3", ["c"], ["F2"]), b("F4", ["d"])]),
      { ok: true, waves: [["F2", "F4"], ["F3"]] });
  });

  it("runs a batch that anchors no path alone", () => {
    deepStrictEqual(batchWaves([b("F1", ["a"]), b("F2", []), b("F3", ["c"])]),
      { ok: true, waves: [["F1", "F3"], ["F2"]] });
    deepStrictEqual(batchWaves([b("F1", []), b("F2", ["b"])]), { ok: true, waves: [["F1"], ["F2"]] });
  });

  it("refuses an unknown dependency or a cycle, as the sequential order does", () => {
    for (const plan of [[b("F1", ["a"], ["F9"])], [b("F1", ["a"], ["F2"]), b("F2", ["b"], ["F1"])]]) {
      const waves = batchWaves(plan);
      strictEqual(waves.ok, false);
      ok(!waves.ok && /unknown dependency|cycle/.test(waves.problem));
    }
  });

  it("has no wave when every batch is done", () => {
    deepStrictEqual(batchWaves([b("F1", ["a"], [], true)]), { ok: true, waves: [] });
  });
});

describe("sheetAnchorPaths", () => {
  it("reads every column of ## Anchors, bare and unique, a member or a note no path", () => {
    deepStrictEqual(sheetAnchorPaths(SHEET), [
      "src/commands/_lib/memory.ts",
      "src/shared/domain/memory-prune.test.ts",
      "src/shared/domain/memory-prune.ts",
      "src/shared/domain/memory.ts",
      "tests/commands-memory.test.ts",
      "tests/support/fake-memory-store.ts",
    ]);
  });

  it("cuts ./ and a :line", () => {
    strictEqual(barePath("./src/a.ts:40"), "src/a.ts");
  });
});

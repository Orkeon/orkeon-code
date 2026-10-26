// harvestAfterGaps over fixture verdict files in a LiveListingFiles work folder (M-7): the candidates a recurring
// gap justifies, the /dev-learn nudge at two batches, nothing below, nothing on a failure. Run:
//   node --test tests/shared/application/shared-memory/harvest-after-gaps.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { harvestAfterGaps, learnNudge } from "../../../../src/shared/application/shared-memory/harvest-after-gaps.ts";
import {
  CANDIDATE, GAP, NUDGE_THREE, NUDGE_TWO, OUTSIDE_MOUNTS, layout, setup, throwingClock, treatFirstRows, work,
} from "./harvest-after-gaps.fixtures.ts";
import { assertOneCandidateLine, assertWritesUnder } from "./harvest-after-gaps.assertions.ts";

describe("harvestAfterGaps", () => {
  it("writes one mistake candidate for a gap that recurs in three batches, names it, and nudges /dev-learn", async () => {
    // Arrange
    const f = setup({ a: [GAP], b: [GAP], c: [GAP] });

    // Act
    const lines = await harvestAfterGaps(f.deps, work);

    // Assert
    ok(f.files.files.has(CANDIDATE), [...f.files.files.keys()].join("\n"));
    ok(f.files.files.get(CANDIDATE)?.includes("status: candidate"));
    strictEqual(lines.length, 2, lines.join("\n"));
    assertOneCandidateLine(lines[0]);
    strictEqual(lines[1], NUDGE_THREE);
    assertWritesUnder(f.files.writes, layout.candidates);
  });

  it("at two batches: no candidate (the threshold is three) but the nudge", async () => {
    // Arrange
    const f = setup({ a: [GAP], b: [GAP] });

    // Act
    const lines = await harvestAfterGaps(f.deps, work);

    // Assert
    strictEqual(f.files.writes.length, 0);
    deepStrictEqual(lines, [NUDGE_TWO]);
  });

  it("one batch: nothing to say", async () => {
    // Arrange
    const { deps } = setup({ a: [GAP, "another gap"] });

    // Act
    const lines = await harvestAfterGaps(deps, work);

    // Assert
    deepStrictEqual(lines, []);
  });

  it("a work folder without a GAPS row: nothing to say", async () => {
    // Arrange
    const { deps } = setup({});

    // Act
    const lines = await harvestAfterGaps(deps, work);

    // Assert
    deepStrictEqual(lines, []);
  });

  it("a work folder outside the mounts: nothing read further", async () => {
    // Arrange
    const { deps } = setup({ a: [GAP] });

    // Act
    const lines = await harvestAfterGaps(deps, OUTSIDE_MOUNTS);

    // Assert
    deepStrictEqual(lines, []);
  });

  it("leaves out the rows /dev-learn treated from the nudge, not from the harvest", async () => {
    // Arrange
    const f = setup({ a: [GAP], b: [GAP], c: [GAP] });
    treatFirstRows(f.files, 2);

    // Act
    const lines = await harvestAfterGaps(f.deps, work);

    // Assert
    strictEqual(lines.length, 1, lines.join("\n"));
    ok(lines[0].startsWith("shared memory: 1 mistake candidate"), lines[0]);
  });

  it("costs the lines, never the verdict, when the memory cannot be written, and says why in the log", async () => {
    // Arrange
    const f = setup({ a: [GAP], b: [GAP], c: [GAP] });
    f.files.writeErrors.push({ prefix: CANDIDATE, error: () => new Error("denied by a rule") });

    // Act
    const lines = await harvestAfterGaps(f.deps, work);

    // Assert
    ok(!lines.some((l) => l.startsWith("shared memory:")), lines.join("\n"));
    ok(f.log.lines.some((l) => l.startsWith("warn: shared memory: harvest: ") && l.includes("denied by a rule")), f.log.lines.join("\n"));
  });

  it("returns no line and warns once when a dependency throws", async () => {
    // Arrange
    const f = setup({ a: [GAP], b: [GAP], c: [GAP] });

    // Act
    const lines = await harvestAfterGaps({ ...f.deps, clock: throwingClock }, work);

    // Assert
    deepStrictEqual(lines, []);
    ok(f.log.lines.some((l) => l === "warn: shared memory: harvest after the verdict failed (no clock)"), f.log.lines.join("\n"));
  });
});

describe("learnNudge", () => {
  it("is empty below two batches", () => {
    // Arrange
    const rows: [] = [];

    // Act
    const nudge = learnNudge(rows);

    // Assert
    strictEqual(nudge, "");
  });
});

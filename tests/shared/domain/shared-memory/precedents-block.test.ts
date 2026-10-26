// The "## Precedents" block (M-3): markers, bounds, grouping, cut line. Run:
//   node --test tests/shared/domain/shared-memory/precedents-block.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { MAX_PRECEDENTS, MAX_PRECEDENTS_CHARS, buildPrecedentsBlock, precedentLines } from "../../../../src/shared/domain/shared-memory/precedents-block.ts";
import {
  DISAGREEING_PROJECTS, EIGHT_METHODS, FIVE_LONG_METHODS, PINNED_MARKERS, p, sampleEntry,
} from "./precedents-block.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("buildPrecedentsBlock", () => {
  it("is empty when nothing was recalled", () => {
    // Arrange
    const recalled: [] = [];

    // Act
    const block = buildPrecedentsBlock(recalled);

    // Assert
    strictEqual(block, "");
  });

  it("carries the pinned markers of the five rules in its intro", () => {
    // Arrange
    const recalled = [p(sampleEntry("method", "a"), 0.9)];

    // Act
    const block = buildPrecedentsBlock(recalled);

    // Assert
    ok(block.startsWith("## Precedents\n"), block);
    assertMentions(block, PINNED_MARKERS);
  });

  it("renders a precedent in six lines at most, a mistake with its correction and signal", () => {
    // Arrange
    const mistake = p(sampleEntry("mistake", "loop"), 1);

    // Act
    const lines = precedentLines(mistake);

    // Assert
    strictEqual(lines.length, 6);
    ok(lines[0].startsWith("- shop-mistake-20261022-loop · mistake · shop · 2026-10-22: "), lines[0]);
    ok(lines.some((l) => l === "  correction: do the other thing"), lines.join("\n"));
    ok(lines.some((l) => l === "  signal: a red test on the edge case"), lines.join("\n"));
  });

  it("renders a decision in four lines, without correction nor signal", () => {
    // Arrange
    const decision = p(sampleEntry("decision", "d"), 1);

    // Act
    const lines = precedentLines(decision);

    // Assert
    strictEqual(lines.length, 4);
  });

  it("keeps five precedents, best first, and counts the others", () => {
    // Arrange
    const many = EIGHT_METHODS;

    // Act
    const block = buildPrecedentsBlock(many);

    // Assert
    strictEqual((block.match(/^- /gm) ?? []).length, MAX_PRECEDENTS);
    ok(block.indexOf("shop-method-20261022-m7") < block.indexOf("shop-method-20261022-m6"), block);
    ok(!block.includes("shop-method-20261022-m2 "), block);
    ok(block.endsWith("3 more precedents not shown."), block);
  });

  it("stays within its character bound", () => {
    // Arrange
    const many = FIVE_LONG_METHODS;

    // Act
    const block = buildPrecedentsBlock(many);

    // Assert
    ok(block.length <= MAX_PRECEDENTS_CHARS, String(block.length));
    ok(/\d more precedents? not shown\.$/.test(block), block.slice(-60));
  });

  it("shows a topic two projects hold as one slot, newest first, under 'projects disagree'", () => {
    // Arrange
    const recalled = DISAGREEING_PROJECTS;

    // Act
    const block = buildPrecedentsBlock(recalled);

    // Assert
    ok(block.includes("Topic money — projects disagree:"), block);
    ok(block.indexOf("billing-decision") < block.indexOf("shop-decision"), block);
    strictEqual((block.match(/^- /gm) ?? []).length, 6, "the disagreement counts as one slot of five");
    ok(block.endsWith("1 more precedent not shown."), block);
  });
});

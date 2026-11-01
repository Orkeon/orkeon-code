// The owner-lines review: the lines a key term finds, the removed lines the owner lacks,
// the problems and owner lines a re-ask shows, and the summary the proposal records. Run:
//   node --test tests/crews/dev-learn/domain/owner-lines.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { matchOwner, ownerSummary, reviewOwner } from "../../../../src/crews/dev-learn/domain/owner-lines.ts";
import { LABEL, LONG_OWNER, OWNER_TEXT, PATH, REVIEW_CASES, SUMMARY, reviewed } from "./owner-lines.fixtures.ts";
import { assertLinesCut } from "./owner-lines.assertions.ts";

describe("matchOwner", () => {
  it("finds the lines holding the key term, case and accents folded, numbered from 1", () => {
    // Arrange
    const text = OWNER_TEXT;

    // Act
    const match = matchOwner(text, "REFUSAL", []);

    // Assert
    deepStrictEqual(match.hits.map((h) => h.n), [2, 4]);
  });

  it("lists, trimmed, each removed line the owner does not hold", () => {
    // Arrange
    const removed = [" Keep it short.", "A line nobody wrote. "];

    // Act
    const match = matchOwner(OWNER_TEXT, "refusal", removed);

    // Assert
    deepStrictEqual(match.missing, ["A line nobody wrote."]);
  });
});

describe("reviewOwner", () => {
  for (const c of REVIEW_CASES) {
    it(c.name, () => {
      // Arrange
      const match = matchOwner(OWNER_TEXT, c.motif.keyTerm, c.motif.linesRemoved);

      // Act
      const review = reviewOwner(LABEL, c.motif, PATH, match);

      // Assert
      deepStrictEqual([review.problems, review.block], [c.problems, c.block]);
    });
  }

  it("shows the first eight owner lines, each cut at 160 characters", () => {
    // Arrange
    const match = matchOwner(LONG_OWNER, "refusal", []);

    // Act
    const review = reviewOwner(LABEL, reviewed(), PATH, match);

    // Assert
    assertLinesCut(review.block, PATH);
  });
});

describe("ownerSummary", () => {
  it("says where the key term is, that the owner may already say a new motif, and each removed line not found", () => {
    // Arrange
    const motif = reviewed({ linesRemoved: ["A line nobody wrote."] });
    const match = matchOwner(OWNER_TEXT, motif.keyTerm, motif.linesRemoved);

    // Act
    const summary = ownerSummary(motif, PATH, match);

    // Assert
    strictEqual(summary, SUMMARY);
  });
});

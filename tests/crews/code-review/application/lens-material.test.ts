// What the review lenses are shown, bounded: the diff, the prior findings, the conventions. Run:
//   node --test tests/crews/code-review/application/lens-material.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  MAX_CONVENTIONS_CHARS, MAX_PRIOR_FINDINGS_IN_PROMPT, conventionsShown, cutDiff, priorFindingsShown,
} from "../../../../src/crews/code-review/application/lens-material.ts";
import { manyPriorFindings } from "./lens-material.fixtures.ts";

describe("cutDiff", () => {
  it("leaves a short diff alone", () => {
    // Arrange
    const diff = "abc";

    // Act
    const cut = cutDiff(diff, 10);

    // Assert
    strictEqual(cut, "abc");
  });

  it("says how much of a long diff it left out", () => {
    // Arrange
    const diff = "abcdef";

    // Act
    const cut = cutDiff(diff, 4);

    // Assert
    strictEqual(cut, "abcd\n[diff cut after 4 characters: 2 characters left out]");
  });
});

describe("priorFindingsShown", () => {
  it("bounds the prior list so the prompt cannot grow without limit", () => {
    // Arrange
    const many = manyPriorFindings(100);

    // Act
    const shown = priorFindingsShown(many);

    // Assert
    deepStrictEqual(shown.map((f) => f.file), many.slice(0, MAX_PRIOR_FINDINGS_IN_PROMPT).map((f) => f.file));
  });
});

describe("conventionsShown", () => {
  it("trims the conventions and cuts them at MAX_CONVENTIONS_CHARS", () => {
    // Arrange
    const conventions = `  ${"x".repeat(MAX_CONVENTIONS_CHARS + 10)}  `;

    // Act
    const shown = conventionsShown(conventions);

    // Assert
    strictEqual(shown, "x".repeat(MAX_CONVENTIONS_CHARS));
  });
});

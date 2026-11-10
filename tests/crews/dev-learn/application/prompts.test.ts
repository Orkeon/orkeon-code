// The learner's instructions: each behaviour pinned by one marker, no host vocabulary,
// none of the material. Run:
//   node --test tests/crews/dev-learn/application/prompts.test.ts
import { describe, it } from "node:test";
import { ok } from "node:assert";

import { LEARN_INSTRUCTIONS } from "../../../../src/crews/dev-learn/application/prompts.ts";
import { HOST_WORDS, MARKERS, MATERIAL } from "./prompts.fixtures.ts";
import { assertOmits } from "../../../support/assertions/text.ts";

describe("LEARN_INSTRUCTIONS — one marker per behaviour", () => {
  for (const { behaviour, marker } of MARKERS) {
    it(behaviour, () => {
      // Arrange
      const expected = marker;

      // Act
      const text = LEARN_INSTRUCTIONS;

      // Assert
      ok(text.includes(expected), expected);
    });
  }

  it("speaks no host vocabulary", () => {
    // Arrange
    const words = HOST_WORDS;

    // Act
    const text = LEARN_INSTRUCTIONS;

    // Assert
    assertOmits(text, words);
  });

  it("holds none of the material", () => {
    // Arrange
    const material = MATERIAL;

    // Act
    const text = LEARN_INSTRUCTIONS;

    // Assert
    assertOmits(text, material);
  });
});

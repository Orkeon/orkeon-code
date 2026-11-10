// The auditor's system message: each behaviour of the specification pinned by one marker, the material kept out of
// it (the brief, the follow-up and the answer prompt: audit-brief.test.ts). Run:
//   node --test tests/crews/dev-verify/application/prompts.test.ts
import { describe, it } from "node:test";
import { ok } from "node:assert";

import { AUDITOR_SYSTEM } from "../../../../src/crews/dev-verify/application/prompts.ts";
import { HOST_WORDS, MATERIAL, REMOVED_FROM_SYSTEM, SHARED_RULES, SYSTEM_MARKERS, auditorOwnWords } from "./prompts.fixtures.ts";
import { assertOmits } from "../../../support/assertions/text.ts";

describe("AUDITOR_SYSTEM — one marker per behaviour", () => {
  for (const [behaviour, marker] of SYSTEM_MARKERS) {
    it(behaviour, () => {
      // Arrange
      const system = AUDITOR_SYSTEM;

      // Act
      const holds = system.includes(marker);

      // Assert
      ok(holds, marker);
    });
  }

  for (const [rule, text] of SHARED_RULES) {
    it(`carries ${rule} whole`, () => {
      // Arrange
      const system = AUDITOR_SYSTEM;

      // Act
      const holds = system.includes(text);

      // Assert
      ok(holds, rule);
    });
  }

  for (const [behaviour, gone] of REMOVED_FROM_SYSTEM) {
    it(`says in its own words ${behaviour}`, () => {
      // Arrange
      const gones = [gone];

      // Act
      const own = auditorOwnWords();

      // Assert
      assertOmits(own, gones);
    });
  }

  it("says the Conventions row is always the auditor's", () => {
    // Arrange
    const system = AUDITOR_SYSTEM;

    // Act
    const holds = system.includes("Conventions row");

    // Assert
    ok(holds);
  });

  it("speaks no host vocabulary", () => {
    // Arrange
    const words = HOST_WORDS;

    // Act
    const system = AUDITOR_SYSTEM;

    // Assert
    assertOmits(system, words);
  });

  it("holds none of the material", () => {
    // Arrange
    const material = MATERIAL;

    // Act
    const system = AUDITOR_SYSTEM;

    // Assert
    assertOmits(system, material);
  });
});

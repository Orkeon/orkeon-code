// The init-verifiers prompts: the readiness classification, the skill outline and
// the material both read. Run:
//   node --test tests/crews/init-verifiers/application/prompts.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import {
  buildReadinessPrompt, buildVerifierSkillPrompt, renderVerifierMaterial,
} from "../../../../src/crews/init-verifiers/application/prompts.ts";
import { BARE, BARE_TEXT, MATERIAL, MATERIAL_TEXT, SKILL_RULES } from "./prompts.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("the readiness prompt", () => {
  it("defines each program kind and lets a list stay empty", () => {
    // Arrange
    const listing: string[] = [];

    // Act
    const p = buildReadinessPrompt(listing, "{}");

    // Assert
    assertMentions(p, [
      "cli (", "web (", "api (", "library (", "true only when the inputs show them", "Leave a list empty rather than guess",
    ]);
  });

  it("counts a test command of the Commands section as a sign of tests", () => {
    // Arrange
    const listing: string[] = [];

    // Act
    const p = buildReadinessPrompt(listing, "{}");

    // Assert
    assertMentions(p, ["a test script or target of a manifest", "a test command of the Commands section"]);
  });

  it("reads the project material it is given", () => {
    // Arrange
    const material = renderVerifierMaterial(MATERIAL);

    // Act
    const p = buildReadinessPrompt(["pyproject.toml"], material);

    // Assert
    assertMentions(p, [MATERIAL_TEXT]);
  });
});

describe("the verification skill prompt", () => {
  for (const c of SKILL_RULES) {
    it(c.name, () => {
      // Arrange
      const zone = "cli";

      // Act
      const { system } = buildVerifierSkillPrompt(zone);

      // Assert
      assertMentions(system, c.markers);
    });
  }

  it("writes the skill from the project material it is given", () => {
    // Arrange
    const material = renderVerifierMaterial(MATERIAL);

    // Act
    const { user } = buildVerifierSkillPrompt("cli", { material });

    // Assert
    assertMentions(user, [MATERIAL_TEXT]);
  });
});

describe("renderVerifierMaterial", () => {
  it("renders the manifests and the Commands section", () => {
    // Arrange
    const material = MATERIAL;

    // Act
    const text = renderVerifierMaterial(material);

    // Assert
    strictEqual(text, MATERIAL_TEXT);
  });

  it("says none for each source a project lacks", () => {
    // Arrange
    const material = BARE;

    // Act
    const text = renderVerifierMaterial(material);

    // Assert
    strictEqual(text, BARE_TEXT);
  });
});

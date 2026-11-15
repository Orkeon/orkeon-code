// The spec writer's prompt: one marker per rule of form it states, so that no limit code checks is met first as a
// refusal. Run:  node --test tests/crews/dev-spec/application/prompts.test.ts
import { describe, it } from "node:test";
import { ok } from "node:assert";

import { specPromptHead } from "../../../../src/crews/dev-spec/application/prompts.ts";
import { FORM_MARKERS } from "./prompts.fixtures.ts";

describe("specPromptHead — the form code checks", () => {
  for (const [rule, marker] of FORM_MARKERS) {
    it(`says ${rule}`, () => {
      // Arrange
      const code = "prune";

      // Act
      const head = specPromptHead(code, "draft", [], [], []).join("\n");

      // Assert
      ok(head.includes(marker), marker);
    });
  }
});

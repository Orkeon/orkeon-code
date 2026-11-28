// The session commands' prompts (commands/_lib/session/prompts.ts), a marker per rule of docs/turn.md (ADR 0003).
// Run: node --test tests/commands/_lib/session/prompts.test.ts
import { describe, it } from "node:test";

import { CARRY_OUT_PLAN } from "../../../../src/commands/_lib/session/prompts.ts";
import { assertMentions } from "../../../support/assertions/text.ts";
import { CARRY_OUT_RULES } from "./prompts.fixtures.ts";

describe("CARRY_OUT_PLAN", () => {
  for (const c of CARRY_OUT_RULES) {
    it(c.name, () => {
      // Arrange
      const { markers } = c;

      // Act
      const prompt = CARRY_OUT_PLAN;

      // Assert
      assertMentions(prompt, markers);
    });
  }
});

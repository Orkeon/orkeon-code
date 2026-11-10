// The planner's instructions: each behaviour pinned by one marker. Run:
//   node --test tests/crews/dev-plan/application/prompts.test.ts
import { describe, it } from "node:test";
import { ok } from "node:assert";

import { PLAN_INSTRUCTIONS } from "../../../../src/crews/dev-plan/application/prompts.ts";
import { PLAN_MARKERS } from "./prompts.fixtures.ts";

describe("PLAN_INSTRUCTIONS — one marker per behaviour", () => {
  for (const [behaviour, marker] of PLAN_MARKERS) {
    it(behaviour, () => {
      // Arrange
      const instructions = PLAN_INSTRUCTIONS;

      // Act
      const text = instructions.toLowerCase();

      // Assert
      ok(text.includes(marker.toLowerCase()), marker);
    });
  }
});

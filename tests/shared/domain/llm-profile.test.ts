// shared/domain/llm-profile.ts: the notation of `llm.profile` and the profile a crew input names. Run:
//   node --test tests/shared/domain/llm-profile.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { LLM_PROFILE_CONFIG_KEY, LLM_PROFILE_INPUT_KEY, llmProfileOf, llmProfileProblem } from "../../../src/shared/domain/llm-profile.ts";
import { INPUT_PROFILES, PROFILE_NAMES } from "./llm-profile.fixtures.ts";

describe("llmProfileProblem", () => {
  for (const c of PROFILE_NAMES) {
    it(c.name, () => {
      // Arrange
      const value = c.value;

      // Act
      const problem = llmProfileProblem(value);

      // Assert
      strictEqual(problem, c.problem);
    });
  }
});

describe("llmProfileOf", () => {
  for (const c of INPUT_PROFILES) {
    it(c.name, () => {
      // Arrange
      const input = c.input;

      // Act
      const profile = llmProfileOf(input);

      // Assert
      strictEqual(profile, c.profile);
    });
  }

  it("reads the field the command writes, llmProfile, for the key llm.profile", () => {
    // Arrange
    const names = { key: LLM_PROFILE_CONFIG_KEY, field: LLM_PROFILE_INPUT_KEY };

    // Act
    const pair = `${names.key} -> ${names.field}`;

    // Assert
    strictEqual(pair, "llm.profile -> llmProfile");
  });
});

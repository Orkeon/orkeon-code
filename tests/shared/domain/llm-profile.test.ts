// shared/domain/llm-profile.ts: the notation of `llm.profile` and the profile a crew input names. Run:
//   node --test tests/shared/domain/llm-profile.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { LLM_PROFILE_CONFIG_KEY, LLM_PROFILE_INPUT_KEY, actProfilesOf, agentsProfileOf, llmProfileOf, llmProfileProblem, llmSessionProfileOf, spawnedActProfilesOf, spawnedAgentInput, takesPromptCache } from "../../../src/shared/domain/llm-profile.ts";
import { ACT_PROFILE_INPUTS, AGENTS_PROFILES, CACHE_PROVIDERS, INPUT_PROFILES, SPAWNED_ACT_PROFILE_INPUTS, SPAWNED_INPUTS, PROFILE_NAMES, SESSION_PROFILES } from "./llm-profile.fixtures.ts";

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

describe("llmSessionProfileOf", () => {
  for (const c of SESSION_PROFILES) {
    it(c.name, () => {
      // Arrange
      const input = c.input;

      // Act
      const profile = llmSessionProfileOf(input);

      // Assert
      strictEqual(profile, c.profile);
    });
  }
});

describe("takesPromptCache", () => {
  for (const c of CACHE_PROVIDERS) {
    it(c.name, () => {
      // Arrange
      const provider = c.provider;

      // Act
      const takes = takesPromptCache(provider);

      // Assert
      strictEqual(takes, c.takes);
    });
  }
});

describe("agentsProfileOf", () => {
  for (const c of AGENTS_PROFILES) {
    it(c.name, () => {
      // Arrange
      const input = c.input;

      // Act
      const profile = agentsProfileOf(input);

      // Assert
      strictEqual(profile, c.profile);
    });
  }
});

describe("spawnedAgentInput", () => {
  for (const c of SPAWNED_INPUTS) {
    it(c.name, () => {
      // Arrange
      const input = c.input;

      // Act
      const spawned = spawnedAgentInput(input);

      // Assert
      deepStrictEqual(spawned, c.spawned);
    });
  }
});

describe("actProfilesOf", () => {
  for (const c of ACT_PROFILE_INPUTS) {
    it(c.name, () => {
      // Arrange
      const input = c.input;

      // Act
      const profiles = actProfilesOf(input);

      // Assert
      deepStrictEqual(profiles, c.profiles);
    });
  }
});

describe("spawnedActProfilesOf", () => {
  for (const c of SPAWNED_ACT_PROFILE_INPUTS) {
    it(c.name, () => {
      // Arrange
      const input = c.input;

      // Act
      const profiles = spawnedActProfilesOf(input);

      // Assert
      deepStrictEqual(profiles, c.profiles);
    });
  }
});

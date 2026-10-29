// shared/application/llm-profile.ts: the session's `llm.profile` read before a launch, over a config store on FakeFiles. Run:
//   node --test tests/shared/application/llm-profile.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";
import { readLlmProfile } from "../../../src/shared/application/llm-profile.ts";
import { malformedProjectConfig, NOT_A_NAME_WARNING, profileConfig, UNREADABLE_WARNING } from "./llm-profile.fixtures.ts";

describe("readLlmProfile", () => {
  it("reads the profile the settings name", async () => {
    // Arrange
    const { config } = profileConfig(" guarded ");

    // Act
    const read = await readLlmProfile(config);

    // Assert
    deepStrictEqual(read, { profile: "guarded" });
  });

  it("names no profile when the settings hold none", async () => {
    // Arrange
    const { config } = profileConfig();

    // Act
    const read = await readLlmProfile(config);

    // Assert
    deepStrictEqual(read, { profile: null });
  });

  it("warns and names no profile when the value is not a profile name", async () => {
    // Arrange
    const { config } = profileConfig("a b");

    // Act
    const read = await readLlmProfile(config);

    // Assert
    deepStrictEqual(read, { profile: null, warning: NOT_A_NAME_WARNING });
  });

  it("warns and names no profile when the project file cannot be parsed", async () => {
    // Arrange
    const config = malformedProjectConfig();

    // Act
    const read = await readLlmProfile(config);

    // Assert
    deepStrictEqual(read, { profile: null, warning: UNREADABLE_WARNING });
  });
});

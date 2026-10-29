// shared/infrastructure/orkeon/llm-profile.ts: an agent builder on the profile the crew input names. Run:
//   node --test tests/shared/infrastructure/orkeon/llm-profile.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { profiledAgent } from "../../../../src/shared/infrastructure/orkeon/llm-profile.ts";
import { factories } from "./llm-profile.fixtures.ts";

describe("profiledAgent", () => {
  it("builds the agent on the profile the input names", () => {
    // Arrange
    const host = factories();

    // Act
    const builder = profiledAgent({ prompt: "hi", llmProfile: "guarded" }, host);

    // Assert
    strictEqual(builder, host.built[0]);
    deepStrictEqual(host.built[0].configs.map((config) => config.profile), ["guarded"]);
  });

  it("gives the plain builder, on the host's default model, when the input names no profile", () => {
    // Arrange
    const host = factories();

    // Act
    const builder = profiledAgent({ prompt: "hi" }, host);

    // Assert
    strictEqual(builder, host.built[0]);
    deepStrictEqual(host.built[0].configs, []);
  });

  it("gives the plain builder on a host without llm when the input names no profile", () => {
    // Arrange
    const host = factories(false);

    // Act
    const builder = profiledAgent({}, host);

    // Assert
    deepStrictEqual(builder.configs, []);
  });

  it("throws, naming the profile, on a host without llm when the input names one", () => {
    // Arrange
    const host = factories(false);

    // Act
    const build = () => profiledAgent({ llmProfile: "guarded" }, host);

    // Assert
    throws(build, { message: "llm.profile 'guarded': this host declares no llm namespace, no profile can be applied" });
  });
});

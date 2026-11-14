// The ReasoningReader over FakeLlmConfigs, a stand-in `llm` namespace (shared/infrastructure/orkeon/reasoning.ts). Run:
//   node --test tests/shared/infrastructure/orkeon/reasoning.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { createReasoningReader } from "../../../../src/shared/infrastructure/orkeon/reasoning.ts";
import { FakeLlmConfigs } from "../../../support/doubles/fake-llm-configs.ts";
import { BOOT, DECLARED_PROFILE_CASES, DEFAULT_PROFILE, NO_PROVIDER, HOST_PROFILES, MEDIUM_ON_GLM, OVERRIDE, PROFILED, UNDECLARED_PROFILE } from "./reasoning.fixtures.ts";

describe("createReasoningReader — capabilities", () => {
  it("reads what the host's own model takes when the session names neither a profile nor a model", () => {
    // Arrange
    const reader = createReasoningReader(new FakeLlmConfigs());

    // Act
    const capabilities = reader.capabilities(BOOT);

    // Assert
    deepStrictEqual(capabilities, { model: "glm-5.3", known: true, efforts: ["low", "high", "max"] });
  });

  it("reads the /model override on the host's provider", () => {
    // Arrange
    const host = new FakeLlmConfigs();
    const reader = createReasoningReader(host);

    // Act
    const capabilities = reader.capabilities(OVERRIDE);

    // Assert
    deepStrictEqual([host.asked, capabilities?.known], [["model:my-custom"], false]);
  });

  for (const c of DECLARED_PROFILE_CASES) {
    it(`reads the profile the host declares: ${c.name}`, () => {
      // Arrange
      const host = new FakeLlmConfigs();
      host.profileModels = HOST_PROFILES;
      const reader = createReasoningReader(host);

      // Act
      const capabilities = reader.capabilities(c.target);

      // Assert
      deepStrictEqual([host.asked, capabilities?.model], [[`profile:${c.target.profile}`], "glm-5.3"]);
    });
  }

  it("answers nothing for a profile the host does not declare, without asking for it", () => {
    // Arrange
    const host = new FakeLlmConfigs();
    host.profileModels = HOST_PROFILES;
    const reader = createReasoningReader(host);

    // Act
    const capabilities = reader.capabilities(UNDECLARED_PROFILE);

    // Assert
    deepStrictEqual([capabilities, host.asked], [null, []]);
  });

  it("reads the host's own model for the profile named default, in any case", () => {
    // Arrange
    const host = new FakeLlmConfigs();
    const reader = createReasoningReader(host);

    // Act
    const capabilities = reader.capabilities(DEFAULT_PROFILE);

    // Assert
    deepStrictEqual([capabilities?.model, host.asked], ["glm-5.3", ["profile:Default"]]);
  });

  it("answers nothing when the runtime refuses the configuration", () => {
    // Arrange
    const host = new FakeLlmConfigs();
    host.refusal = NO_PROVIDER;
    const reader = createReasoningReader(host);

    // Act
    const capabilities = reader.capabilities(BOOT);

    // Assert
    strictEqual(capabilities, null);
  });

  it("answers nothing on a host without the llm namespace", () => {
    // Arrange
    const reader = createReasoningReader(undefined);

    // Act
    const capabilities = reader.capabilities(BOOT);

    // Assert
    strictEqual(capabilities, null);
  });
});

describe("createReasoningReader — effort", () => {
  it("reads what the runtime sends for a level the model does not take", () => {
    // Arrange
    const reader = createReasoningReader(new FakeLlmConfigs());

    // Act
    const report = reader.effort(BOOT, "medium");

    // Assert
    deepStrictEqual(report, MEDIUM_ON_GLM);
  });

  it("reads a level sent unchecked on a model the table does not know", () => {
    // Arrange
    const reader = createReasoningReader(new FakeLlmConfigs());

    // Act
    const report = reader.effort(OVERRIDE, "medium");

    // Assert
    deepStrictEqual(report, { model: "my-custom", asked: "medium", sent: "medium", notice: "unchecked" });
  });

  it("reads what the host's own configuration sends when no level is asked", () => {
    // Arrange
    const host = new FakeLlmConfigs();
    host.hostEffort = "medium";
    const reader = createReasoningReader(host);

    // Act
    const report = reader.effort(BOOT, null);

    // Assert
    deepStrictEqual(report, MEDIUM_ON_GLM);
  });

  it("answers nothing when no level is asked and the host's own configuration asks for none", () => {
    // Arrange
    const reader = createReasoningReader(new FakeLlmConfigs());

    // Act
    const report = reader.effort(BOOT, null);

    // Assert
    strictEqual(report, null);
  });

  it("reads what the runtime sends for a level on a profile the host declares", () => {
    // Arrange
    const host = new FakeLlmConfigs();
    host.profileModels = HOST_PROFILES;
    const reader = createReasoningReader(host);

    // Act
    const report = reader.effort(PROFILED, "medium");

    // Assert
    deepStrictEqual(report, MEDIUM_ON_GLM);
  });

  it("answers nothing for a level on a profile the host does not declare, without asking for it", () => {
    // Arrange
    const host = new FakeLlmConfigs();
    host.profileModels = HOST_PROFILES;
    const reader = createReasoningReader(host);

    // Act
    const report = reader.effort(UNDECLARED_PROFILE, "high");

    // Assert
    deepStrictEqual([report, host.asked], [null, []]);
  });

  it("answers nothing for a level when the runtime refuses the configuration", () => {
    // Arrange
    const host = new FakeLlmConfigs();
    host.refusal = NO_PROVIDER;
    const reader = createReasoningReader(host);

    // Act
    const report = reader.effort(OVERRIDE, "medium");

    // Assert
    strictEqual(report, null);
  });

  it("answers nothing on a host without the llm namespace", () => {
    // Arrange
    const reader = createReasoningReader(undefined);

    // Act
    const report = reader.effort(BOOT, "high");

    // Assert
    strictEqual(report, null);
  });
});

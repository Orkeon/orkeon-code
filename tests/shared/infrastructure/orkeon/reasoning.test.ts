// The ReasoningReader over a stand-in `llm` namespace (shared/infrastructure/orkeon/reasoning.ts). Run:
//   node --test tests/shared/infrastructure/orkeon/reasoning.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { createReasoningReader } from "../../../../src/shared/infrastructure/orkeon/reasoning.ts";
import { BOOT, OVERRIDE, PROFILED, UNDECLARED_PROFILE, hostLlm } from "./reasoning.fixtures.ts";

describe("createReasoningReader — capabilities", () => {
  it("reads what the host's own model takes when the session names neither a profile nor a model", () => {
    // Arrange
    const reader = createReasoningReader(hostLlm());

    // Act
    const capabilities = reader.capabilities(BOOT);

    // Assert
    deepStrictEqual(capabilities, { model: "glm-5.3", known: true, thinking: "effortOnly", efforts: ["low", "high", "max"] });
  });

  it("reads the /model override on the host's provider", () => {
    // Arrange
    const host = hostLlm();
    const reader = createReasoningReader(host);

    // Act
    const capabilities = reader.capabilities(OVERRIDE);

    // Assert
    deepStrictEqual([host.asked, capabilities?.known], [["model:my-custom"], false]);
  });

  it("reads the session's profile, not the /model override under it", () => {
    // Arrange
    const host = hostLlm();
    const reader = createReasoningReader(host);

    // Act
    const capabilities = reader.capabilities(PROFILED);

    // Assert
    deepStrictEqual([host.asked, capabilities?.model], [["profile:guarded"], "glm-5.3"]);
  });

  it("answers nothing for a profile the host does not declare", () => {
    // Arrange
    const reader = createReasoningReader(hostLlm());

    // Act
    const capabilities = reader.capabilities(UNDECLARED_PROFILE);

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
    const reader = createReasoningReader(hostLlm());

    // Act
    const report = reader.effort(BOOT, "medium");

    // Assert
    deepStrictEqual(report, { model: "glm-5.3", asked: "medium", sent: "low", notice: "lowered" });
  });

  it("reads a level sent unchecked on a model the table does not know", () => {
    // Arrange
    const reader = createReasoningReader(hostLlm());

    // Act
    const report = reader.effort(OVERRIDE, "medium");

    // Assert
    deepStrictEqual(report, { model: "my-custom", asked: "medium", sent: "medium", notice: "unchecked" });
  });

  it("answers nothing for a profile the host does not declare", () => {
    // Arrange
    const reader = createReasoningReader(hostLlm());

    // Act
    const report = reader.effort(UNDECLARED_PROFILE, "high");

    // Assert
    strictEqual(report, null);
  });
});

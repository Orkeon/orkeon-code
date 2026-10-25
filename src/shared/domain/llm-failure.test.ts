// The host's failure marker read as a failure, never as an answer. Run:
//   node --test src/shared/domain/llm-failure.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import { llmFailureOf } from "./llm-failure.ts";
import { ANSWERS, MARKER_DETAILS } from "./llm-failure.fixtures.ts";

describe("llmFailureOf", () => {
  it("reads the provider's error out of the marker", () => {
    // Arrange
    const marker = "<undefined-llm:429 Too Many Requests: rate limited>";

    // Act
    const failure = llmFailureOf(marker);

    // Assert
    ok(failure instanceof Error);
    strictEqual(failure!.name, "LlmFailure");
    strictEqual(failure!.detail, "429 Too Many Requests: rate limited");
    strictEqual(failure!.message, "the model call failed: 429 Too Many Requests: rate limited");
  });

  for (const c of MARKER_DETAILS) {
    it(c.name, () => {
      // Arrange
      const { marker } = c;

      // Act
      const failure = llmFailureOf(marker);

      // Assert
      strictEqual(failure!.detail, c.detail);
    });
  }

  it("cuts a long error, as a host without a provider echoes the whole prompt", () => {
    // Arrange
    const marker = `<undefined-llm:act:${"x".repeat(1000)}>`;

    // Act
    const detail = llmFailureOf(marker)!.detail;

    // Assert
    strictEqual(detail, `act:${"x".repeat(296)}…`);
  });

  for (const answer of ANSWERS) {
    it(`takes the answer ${JSON.stringify(answer) ?? String(answer)} for an answer, even one that mentions the marker`, () => {
      // Arrange
      const text = answer;

      // Act
      const failure = llmFailureOf(text);

      // Assert
      strictEqual(failure, null, String(answer));
    });
  }
});

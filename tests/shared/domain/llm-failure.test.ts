// The host's failure marker read as a failure, never as an answer. Run:
//   node --test tests/shared/domain/llm-failure.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";

import { budgetExhaustedAnswer, budgetExhaustedAnswerOf, llmFailureOf } from "../../../src/shared/domain/llm-failure.ts";
import { readBudgetExhausted } from "../../../src/shared/domain/dev/step-budget.ts";
import { ANSWERS, MARKER_DETAILS, NOT_WRAP_UPS } from "./llm-failure.fixtures.ts";

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

describe("budgetExhaustedAnswer", () => {
  it("carries the wrap-up answer under the runtime's error name and the tokens dimension", () => {
    // Arrange
    const answer = "partial";

    // Act
    const failure = budgetExhaustedAnswer(answer);

    // Assert
    deepStrictEqual([failure.name, failure.dimension, failure.answer], ["BudgetExhaustedError", "tokens", "partial"]);
  });

  it("is read as a spent token budget by readBudgetExhausted", () => {
    // Arrange
    const failure = budgetExhaustedAnswer("partial");

    // Act
    const dimension = readBudgetExhausted(failure);

    // Assert
    strictEqual(dimension, "tokens");
  });

  it("names the token budget in its message, for a reader that keeps the first line alone", () => {
    // Arrange
    const failure = budgetExhaustedAnswer("partial");

    // Act
    const dimension = readBudgetExhausted(failure.message);

    // Assert
    strictEqual(dimension, "tokens");
  });
});

describe("budgetExhaustedAnswerOf", () => {
  it("gives the failure back when it carries a wrap-up", () => {
    // Arrange
    const failure = budgetExhaustedAnswer("partial");

    // Act
    const read = budgetExhaustedAnswerOf(failure);

    // Assert
    strictEqual(read, failure);
  });

  for (const c of NOT_WRAP_UPS) {
    it(`is null for ${c.name}`, () => {
      // Arrange
      const { failure } = c;

      // Act
      const read = budgetExhaustedAnswerOf(failure);

      // Assert
      strictEqual(read, null);
    });
  }
});

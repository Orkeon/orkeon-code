// shared/domain/decision/questions.ts: the questions asked of a decision model and the answers read back. Run:
//   node --test tests/shared/domain/decision/questions.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";
import { parseDecisionAnswers, yesNo } from "../../../../src/shared/domain/decision/questions.ts";
import { ANSWER_CASES, QUESTIONS } from "./questions.fixtures.ts";

describe("parseDecisionAnswers", () => {
  for (const c of ANSWER_CASES) {
    it(c.name, () => {
      // Arrange
      const raw = c.raw;

      // Act
      const answers = parseDecisionAnswers(QUESTIONS, raw);

      // Assert
      deepStrictEqual(answers, c.expected);
    });
  }
});

describe("yesNo", () => {
  it("asks what yes means, without instructions when none is given", () => {
    // Arrange
    const yes = "The output is still needed";

    // Act
    const question = yesNo(yes);

    // Assert
    deepStrictEqual(question, { type: "noul", criteria: { true: yes } });
  });

  it("carries the instructions it is given", () => {
    // Arrange
    const instructions = "Judge the last tool call only.";

    // Act
    const question = yesNo("The output is still needed", instructions);

    // Assert
    deepStrictEqual(question, { type: "noul", criteria: { true: "The output is still needed" }, instructions });
  });
});

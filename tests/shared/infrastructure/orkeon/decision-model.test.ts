// The DecisionModel adapter over the host's decide tool. Run:
//   node --test tests/shared/infrastructure/orkeon/decision-model.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { createDecisionModel } from "../../../../src/shared/infrastructure/orkeon/decision-model.ts";
import { QUESTIONS, STATE, UNANSWERED, modelOverTools } from "./decision-model.fixtures.ts";

describe("createDecisionModel", () => {
  it("is unavailable on a host that registers no decide tool", () => {
    // Arrange
    const model = createDecisionModel({});

    // Act
    const available = model.available();

    // Assert
    strictEqual(available, false);
  });

  it("is available on a host that registers the decide tool", () => {
    // Arrange
    const { model } = modelOverTools();

    // Act
    const available = model.available();

    // Assert
    strictEqual(available, true);
  });

  it("answers nothing on a host that registers no decide tool", async () => {
    // Arrange
    const model = createDecisionModel({});

    // Act
    const answers = await model.ask(STATE, QUESTIONS);

    // Assert
    strictEqual(answers, null);
  });

  it("sends the state and the questions as given", async () => {
    // Arrange
    const { tools, model } = modelOverTools();

    // Act
    await model.ask(STATE, QUESTIONS);

    // Assert
    deepStrictEqual(tools.inputs, [{ state: STATE, questions: QUESTIONS }]);
  });

  it("reads the answers by the name of their question", async () => {
    // Arrange
    const { model } = modelOverTools();

    // Act
    const answers = await model.ask(STATE, QUESTIONS);

    // Assert
    deepStrictEqual(answers, { keep: { type: "noul", probability: 0.9 } });
  });

  it("reads a reply the host bridges in PascalCase", async () => {
    // Arrange
    const { tools, model } = modelOverTools();
    tools.reply = { Success: true, Answers: { keep: { noul: 0.2 } } };

    // Act
    const answers = await model.ask(STATE, QUESTIONS);

    // Assert
    deepStrictEqual(answers, { keep: { type: "noul", probability: 0.2 } });
  });

  for (const c of UNANSWERED) {
    it(c.name, async () => {
      // Arrange
      const { tools, model } = modelOverTools();
      tools.reply = c.reply;

      // Act
      const answers = await model.ask(STATE, QUESTIONS);

      // Assert
      strictEqual(answers, null);
    });
  }
});

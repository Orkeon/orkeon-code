// createHumanInput over a stub of tools.humanInput: what each runtime provider returns, read as a person's answer or
// as nobody answering - never a default answer. Run:  node --test src/shared/infrastructure/orkeon/human-input.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { DECIDE_LATER, NO_ANSWER } from "./human-input.ts";
import { CHOICE_NOBODY, MULTI_NOBODY, TEXT_NOBODY, stub } from "./human-input.fixtures.ts";

describe("createHumanInput — choice", () => {
  it("sends the recommended first and a sentinel default, and returns the option picked", async () => {
    // Arrange
    const s = stub({ response: "B", was_default: false });

    // Act
    const answer = await s.human.choice("Q?", ["A", "B"]);

    // Assert
    deepStrictEqual(answer, { answered: true, value: "B" });
    deepStrictEqual(s.calls[0], { prompt: "Q?", input_type: "choice", choices: ["A", "B"], recommended: 0, default_value: NO_ANSWER });
  });

  for (const c of CHOICE_NOBODY) {
    it(c.name, async () => {
      // Arrange
      const human = c.human();

      // Act
      const answer = await human.choice("Q?", ["A", "B"]);

      // Assert
      deepStrictEqual(answer, { answered: false });
    });
  }
});

describe("createHumanInput — text and multi", () => {
  it("returns a typed text, trimmed", async () => {
    // Arrange
    const { human } = stub({ response: " yes " });

    // Act
    const answer = await human.text("Q?");

    // Assert
    deepStrictEqual(answer, { answered: true, value: "yes" });
  });

  for (const c of TEXT_NOBODY) {
    it(c.name, async () => {
      // Arrange
      const human = c.human();

      // Act
      const answer = await human.text("Q?");

      // Assert
      deepStrictEqual(answer, { answered: false });
    });
  }

  it("adds 'Decide later' first with no recommended index, and returns the values in the options' order", async () => {
    // Arrange
    const s = stub({ values: ["m2", "m1"] });

    // Act
    const answer = await s.human.multi("Pick", ["m1", "m2", "m3"]);

    // Assert
    deepStrictEqual(answer, { answered: true, values: ["m1", "m2"] });
    deepStrictEqual(s.calls[0], { prompt: "Pick", input_type: "multi", choices: [DECIDE_LATER, "m1", "m2", "m3"] });
  });

  for (const c of MULTI_NOBODY) {
    it(c.name, async () => {
      // Arrange
      const human = c.human();

      // Act
      const answer = await human.multi("Pick", ["m1"]);

      // Assert
      deepStrictEqual(answer, { answered: false });
    });
  }
});

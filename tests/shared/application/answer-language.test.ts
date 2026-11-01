// The answer language read through the config port. Run:
//   node --test tests/shared/application/answer-language.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { readLanguage } from "../../../src/shared/application/answer-language.ts";
import { NO_LANGUAGE, languageStore } from "./answer-language.fixtures.ts";

describe("readLanguage", () => {
  it("reads answer.language, trimmed", async () => {
    // Arrange
    const store = languageStore(" French ");

    // Act
    const language = await readLanguage(store);

    // Assert
    strictEqual(language, "French");
  });

  for (const c of NO_LANGUAGE) {
    it(`is empty ${c.name}`, async () => {
      // Arrange
      const { store } = c;

      // Act
      const language = await readLanguage(store);

      // Assert
      strictEqual(language, "");
    });
  }
});

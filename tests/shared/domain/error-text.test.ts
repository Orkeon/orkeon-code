// errorText: an error as one line, the whole message kept up to its cut.
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { errorText } from "../../../src/shared/domain/error-text.ts";
import { ERROR_TEXT_CASES } from "./error-text.fixtures.ts";

describe("errorText", () => {
  for (const c of ERROR_TEXT_CASES) {
    it(c.name, () => {
      // Arrange
      const { error } = c;

      // Act
      const text = errorText(error);

      // Assert
      strictEqual(text, c.expected);
    });
  }
});

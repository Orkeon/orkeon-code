import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";
import { tidyWhitespace } from "./whitespace.ts";
import { BLANK_LINES_AT_EOF, CLEAN_TEXTS, TRAILING_WHITESPACE } from "./whitespace.fixtures.ts";

describe("tidyWhitespace", () => {
  for (const sample of BLANK_LINES_AT_EOF) {
    it(`removes the blank lines at the end of ${sample.name}, its final newline kept`, () => {
      // Arrange
      const { text, tidied, fixed } = sample;

      // Act
      const result = tidyWhitespace(text);

      // Assert
      deepStrictEqual(result, { text: tidied, fixed });
    });
  }

  for (const sample of TRAILING_WHITESPACE) {
    it(`strips the trailing whitespace of ${sample.name} and counts the lines`, () => {
      // Arrange
      const { text, tidied, fixed } = sample;

      // Act
      const result = tidyWhitespace(text);

      // Assert
      deepStrictEqual(result, { text: tidied, fixed });
    });
  }

  for (const text of CLEAN_TEXTS) {
    it(`leaves the clean text ${JSON.stringify(text)} as it is`, () => {
      // Arrange
      const expected = { text, fixed: [] };

      // Act
      const result = tidyWhitespace(text);

      // Assert
      deepStrictEqual(result, expected);
    });
  }
});

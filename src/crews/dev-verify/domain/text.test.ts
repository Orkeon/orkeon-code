import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cut, firstLine, stdoutLines } from "./text.ts";
import { CUT_CASES, FIRST_LINE_CASES, STDOUT_LINES_CASES } from "./text.fixtures.ts";

describe("text helpers", () => {
  for (const c of FIRST_LINE_CASES) {
    it(`firstLine keeps the first line, trimmed: ${c.name}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const line = firstLine(text);

      // Assert
      assert.equal(line, c.expected);
    });
  }

  for (const c of STDOUT_LINES_CASES) {
    it(`stdoutLines splits on newlines and drops the trailing empty line: ${c.name}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const lines = stdoutLines(text);

      // Assert
      assert.deepEqual(lines, c.expected);
    });
  }

  for (const c of CUT_CASES) {
    it(`cut ${c.name}`, () => {
      // Arrange
      const { text, max } = c;

      // Act
      const result = cut(text, max);

      // Assert
      assert.equal(result, c.expected);
    });
  }
});

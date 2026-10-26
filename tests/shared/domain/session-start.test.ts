// The start block the runtime puts before a session's first free-text turn. Run:
//   node --test tests/shared/domain/session-start.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { MAX_START_LINES, MAX_START_LINE_CHARS, readStartOutput, splitStartOutput } from "../../../src/shared/domain/session-start.ts";
import { block, NO_BLOCK_INPUTS, NOT_START_OUTPUTS, TOO_LONG_LINE, TOO_MANY_LINES } from "./session-start.fixtures.ts";

describe("splitStartOutput", () => {
  it("takes the block off the head of the input and drops the script's source", () => {
    // Arrange
    const input = `${block("line one\n\nline two")}\n\nhello there`;

    // Act
    const out = splitStartOutput(input);

    // Assert
    deepStrictEqual(out, { start: { script: "/tmp/orkeon-code/session-start.sh", lines: ["line one", "line two"] }, rest: "hello there" });
  });

  for (const c of NO_BLOCK_INPUTS) {
    it(c.name, () => {
      // Arrange
      const { input } = c;

      // Act
      const out = splitStartOutput(input);

      // Assert
      deepStrictEqual(out, { start: null, rest: input });
    });
  }

  it("takes no block that does not open the input", () => {
    // Arrange
    const input = `say ${block("x")}`;

    // Act
    const out = splitStartOutput(input);

    // Assert
    deepStrictEqual(out.start, null);
  });

  it("bounds the lines, saying how many were left out", () => {
    // Arrange
    const input = block(TOO_MANY_LINES);

    // Act
    const lines = splitStartOutput(input).start!.lines;

    // Assert
    strictEqual(lines.length, MAX_START_LINES + 1);
    strictEqual(lines.at(-1), "(3 more line(s) left out)");
  });

  it("bounds the length of a line, ending it with an ellipsis", () => {
    // Arrange
    const input = block(TOO_LONG_LINE);

    // Act
    const long = splitStartOutput(input).start!.lines[0];

    // Assert
    strictEqual(long.length, MAX_START_LINE_CHARS);
    strictEqual(long.endsWith("…"), true);
  });

  it("gives no start for a blank output", () => {
    // Arrange
    const input = `${block("  \n ")}\nhi`;

    // Act
    const out = splitStartOutput(input);

    // Assert
    deepStrictEqual(out, { start: null, rest: "hi" });
  });
});

describe("readStartOutput", () => {
  it("reads a script and its non-blank lines", () => {
    // Arrange
    const value = { script: " /tmp/s.sh ", lines: ["a", 3, " ", "b"] };

    // Act
    const start = readStartOutput(value);

    // Assert
    deepStrictEqual(start, { script: "/tmp/s.sh", lines: ["a", "b"] });
  });

  for (const c of NOT_START_OUTPUTS) {
    it(`reads null from ${c.name}`, () => {
      // Arrange
      const { value } = c;

      // Act
      const start = readStartOutput(value);

      // Assert
      strictEqual(start, null);
    });
  }
});

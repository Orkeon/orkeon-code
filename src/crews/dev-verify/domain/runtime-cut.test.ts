import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runtimeCut } from "./runtime-cut.ts";
import { NOTICE, WHOLE_RESULTS, ZERO_NOTICE_TEXT } from "./runtime-cut.fixtures.ts";

describe("runtimeCut", () => {
  it("strips the notice of a cut result and reads how many characters were omitted", () => {
    // Arrange
    const text = `src/a.ts\nsrc/b${NOTICE}`;

    // Act
    const result = runtimeCut(text);

    // Assert
    assert.deepEqual(result, { kept: "src/a.ts\nsrc/b", omitted: 1234 });
  });

  for (const c of WHOLE_RESULTS) {
    it(`keeps a result without the notice whole: ${c.name}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const result = runtimeCut(text);

      // Assert
      assert.deepEqual(result, { kept: text, omitted: 0 });
    });
  }

  it("does not take a notice in the middle of the text for a cut", () => {
    // Arrange
    const text = `src/a.ts${NOTICE}\nsrc/b.ts\n`;

    // Act
    const result = runtimeCut(text);

    // Assert
    assert.deepEqual(result, { kept: text, omitted: 0 });
  });

  it("does not take a notice of 0 omitted characters for a cut", () => {
    // Arrange
    const text = ZERO_NOTICE_TEXT;

    // Act
    const result = runtimeCut(text);

    // Assert
    assert.deepEqual(result, { kept: text, omitted: 0 });
  });
});

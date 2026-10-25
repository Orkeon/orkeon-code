// SHA-1 vectors: the standard ones, padding edges, multi-byte text, and one learning
// row id. Run:
//   node --test src/shared/domain/sha1.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { sha1Hex, utf8Bytes } from "./sha1.ts";
import { LONE_SURROGATES, VECTORS } from "./sha1.fixtures.ts";

describe("sha1Hex", () => {
  for (const [input, size, hex] of VECTORS) {
    it(`hashes ${size} bytes`, () => {
      // Arrange
      const text = input;

      // Act
      const digest = sha1Hex(text);

      // Assert
      strictEqual(digest, hex);
    });
  }

  it("gives the demo row id of the L-1 fixture", () => {
    // Arrange
    const row = "demo/F2|Test|The refusal of `a/b` is never exercised";

    // Act
    const id = sha1Hex(row).slice(0, 10);

    // Assert
    strictEqual(id, "68abc1ec48");
  });
});

describe("utf8Bytes", () => {
  for (const [input, size] of VECTORS) {
    it(`encodes the ${size}-byte vector in ${size} bytes`, () => {
      // Arrange
      const text = input;

      // Act
      const bytes = utf8Bytes(text);

      // Assert
      strictEqual(bytes.length, size);
    });
  }

  for (const c of LONE_SURROGATES) {
    it(c.name, () => {
      // Arrange
      const { text } = c;

      // Act
      const bytes = utf8Bytes(text);

      // Assert
      deepStrictEqual(bytes, c.bytes);
    });
  }
});

import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { carriedBlocks, carry } from "./carried-text.ts";
import {
  FILE_AND_DIFF, FILES_SHORT_LONG_AFTER, ONE_SHORT_TEXT, SHEET_THEN_DIFF, SHEET_THEN_DIFF_BLOCKS, SHORT_LONG_AFTER,
} from "./carried-text.fixtures.ts";
import { assertCutBlock, assertWithinRoom } from "./carried-text.assertions.ts";

describe("carriedBlocks", () => {
  it("frames each text under its title, its trailing blank lines dropped", () => {
    // Arrange
    const texts = SHEET_THEN_DIFF;

    // Act
    const blocks = carriedBlocks(texts, 10_000);

    // Assert
    deepStrictEqual(blocks, SHEET_THEN_DIFF_BLOCKS);
  });

  it("keeps a text that fits, cuts the one past the room with a note, and names the one left out", () => {
    // Arrange
    const room = 1_000;

    // Act
    const [short, cut, skipped] = carriedBlocks(SHORT_LONG_AFTER, room);

    // Assert
    ok(short.includes("short"), short);
    assertCutBlock(cut);
    strictEqual(skipped, "Not carried (no room left): c.");
  });

  it("stays within the room it is given", () => {
    // Arrange
    const room = 1_000;

    // Act
    const blocks = carriedBlocks(SHORT_LONG_AFTER, room);

    // Assert
    assertWithinRoom(blocks, room);
  });

  it("carries nothing into a room too small for one block, and names what it left out", () => {
    // Arrange
    const room = 100;

    // Act
    const blocks = carriedBlocks(ONE_SHORT_TEXT, room);

    // Assert
    deepStrictEqual(blocks, ["Not carried (no room left): a."]);
  });

  it("returns no block for no text", () => {
    // Arrange
    const texts: [] = [];

    // Act
    const blocks = carriedBlocks(texts, 100);

    // Assert
    deepStrictEqual(blocks, []);
  });
});

describe("carry", () => {
  it("names whole only the file that fits, not the one cut nor the one left out", () => {
    // Arrange
    const room = 1_000;

    // Act
    const { whole } = carry(FILES_SHORT_LONG_AFTER, room);

    // Assert
    deepStrictEqual([...whole], ["src/a.ts"]);
  });

  it("names a file by its path, whatever its title, and no text without one", () => {
    // Arrange
    const texts = FILE_AND_DIFF;

    // Act
    const { whole } = carry(texts, 10_000);

    // Assert
    deepStrictEqual([...whole], ["workbench/x/X-PLAN-F2.md"]);
  });

  it("returns the blocks carriedBlocks returns", () => {
    // Arrange
    const texts = SHORT_LONG_AFTER;

    // Act
    const { blocks } = carry(texts, 1_000);

    // Assert
    deepStrictEqual(blocks, carriedBlocks(texts, 1_000));
  });
});

// Every spelling of a path back to its canonical virtual path. Run:
//   node --test tests/shared/domain/host-paths.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { shellWords } from "../../../src/shared/domain/agent-policy/permission.ts";
import { callToVirtual, commandToVirtual, commandTokens, fromVirtual, textToVirtual, toVirtual } from "../../../src/shared/domain/host-paths.ts";
import {
  CALL_TO_VIRTUAL, COMMAND_TO_VIRTUAL, FROM_VIRTUAL, ROUND_TRIPS, TEXT_TO_VIRTUAL, TOKEN_COMMANDS, TO_VIRTUAL_KEPT, TO_VIRTUAL_MAPPED,
} from "./host-paths.fixtures.ts";

describe("toVirtual", () => {
  for (const c of TO_VIRTUAL_MAPPED) {
    it(`maps a spelling of a base to the canonical virtual path: ${c.name}`, () => {
      // Arrange
      const { input, layout } = c;

      // Act
      const path = toVirtual(input, layout);

      // Assert
      strictEqual(path, c.expected);
    });
  }

  for (const c of TO_VIRTUAL_KEPT) {
    it(`keeps what is not a path under a base: ${c.name}`, () => {
      // Arrange
      const { input, layout } = c;

      // Act
      const path = toVirtual(input, layout);

      // Assert
      strictEqual(path, input);
    });
  }
});

describe("fromVirtual", () => {
  for (const c of FROM_VIRTUAL) {
    it(`spells a virtual path from the mount's base, or answers null: ${c.name}`, () => {
      // Arrange
      const { path, layout, spelling } = c;

      // Act
      const physical = fromVirtual(path, layout, spelling);

      // Assert
      strictEqual(physical, c.expected);
    });
  }

  for (const c of ROUND_TRIPS) {
    it(`round-trips through toVirtual: ${c.name}`, () => {
      // Arrange
      const physical = fromVirtual(c.path, c.layout, c.spelling) as string;

      // Act
      const back = toVirtual(physical, c.layout);

      // Assert
      strictEqual(back, c.path, `${physical} did not come back to ${c.path}`);
    });
  }
});

describe("textToVirtual", () => {
  for (const c of TEXT_TO_VIRTUAL) {
    it(`replaces each physical spelling in a text: ${c.name}`, () => {
      // Arrange
      const { input, layout, keepFenced } = c;

      // Act
      const text = textToVirtual(input, layout, { keepFenced });

      // Assert
      strictEqual(text, c.expected);
    });
  }
});

describe("commandTokens", () => {
  for (const command of TOKEN_COMMANDS) {
    it(`splits the words as shellWords does: ${JSON.stringify(command)}`, () => {
      // Arrange
      const words = shellWords(command);

      // Act
      const tokens = commandTokens(command);

      // Assert
      deepStrictEqual(tokens.map((t) => t.value), words);
    });
  }

  it("records where each word stands and the quote it opened with", () => {
    // Arrange
    const command = `type "C:\\a b" x`;

    // Act
    const tokens = commandTokens(command);

    // Assert
    deepStrictEqual(tokens, [
      { start: 0, end: 4, value: "type", quote: null },
      { start: 5, end: 13, value: "C:\\a b", quote: '"' },
      { start: 14, end: 15, value: "x", quote: null },
    ]);
  });
});

describe("commandToVirtual", () => {
  for (const c of COMMAND_TO_VIRTUAL) {
    it(`canonicalises the words of a command that are paths: ${c.name}`, () => {
      // Arrange
      const { input, layout } = c;

      // Act
      const command = commandToVirtual(input, layout);

      // Assert
      strictEqual(command, c.expected);
    });
  }
});

describe("callToVirtual", () => {
  for (const c of CALL_TO_VIRTUAL) {
    it(`canonicalises the path fields of a call, or answers null: ${c.name}`, () => {
      // Arrange
      const { tool, input, layout } = c;

      // Act
      const mapped = callToVirtual(tool, input, layout);

      // Assert
      deepStrictEqual(mapped, c.expected);
    });
  }

  for (const c of CALL_TO_VIRTUAL.filter((k) => k.expected !== null)) {
    it(`is idempotent on its own result: ${c.name}`, () => {
      // Arrange
      const once = callToVirtual(c.tool, c.input, c.layout);

      // Act
      const twice = callToVirtual(c.tool, once, c.layout);

      // Assert
      strictEqual(twice, null);
    });
  }
});

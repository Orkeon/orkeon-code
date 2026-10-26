// The concurrency of /dev-batches: 1 by default, a whole number from 1 to 4; above 1 only in a mode that never
// asks before a shell command, and the line refusing a worktree git does not work in. Run:
//   node --test src/shared/domain/dev/batches-concurrency.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { MAX_CONCURRENCY, checkConcurrency, concurrencyGitRefusal, concurrencyModeRefusal } from "../../../../src/shared/domain/dev/batches-concurrency.ts";
import {
  ABOVE_MAX, ACCEPTED, ASKING_MODES, LET_THROUGH, NOT_WHOLE_FROM_ONE, modeRefusalLine,
} from "./batches-concurrency.fixtures.ts";
import { assertGitRefusal, assertRefusedStarting, assertRefusedWith } from "./batches-concurrency.assertions.ts";

describe("checkConcurrency", () => {
  for (const c of ACCEPTED) {
    it(`is 1 when absent, and accepts 1 to 4 as a number or a string: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const result = checkConcurrency(raw);

      // Assert
      deepStrictEqual(result, { ok: true, value: c.value });
    });
  }

  it("caps the concurrency at 4", () => {
    // Arrange
    const expected = 4;

    // Act
    const max = MAX_CONCURRENCY;

    // Assert
    strictEqual(max, expected);
  });

  for (const raw of ABOVE_MAX) {
    it(`refuses above 4 in one line: ${JSON.stringify(raw)}`, () => {
      // Arrange
      const line = `concurrency ${raw} refused: at most 4 batches at once`;

      // Act
      const c = checkConcurrency(raw);

      // Assert
      assertRefusedWith(c, line);
    });
  }

  for (const c of NOT_WHOLE_FROM_ONE) {
    it(`refuses what is not a whole number from 1: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const result = checkConcurrency(raw);

      // Assert
      assertRefusedStarting(result, "concurrency must be a whole number from 1", String(raw));
    });
  }
});

describe("concurrencyModeRefusal", () => {
  for (const mode of ASKING_MODES) {
    it(`refuses above 1 in a mode that asks before shell commands: ${JSON.stringify(mode)}`, () => {
      // Arrange
      const expected = modeRefusalLine(mode);

      // Act
      const line = concurrencyModeRefusal(2, mode);

      // Assert
      strictEqual(line, expected);
    });
  }

  for (const c of LET_THROUGH) {
    it(`lets bypassPermissions through, and 1 in any mode: ${c.name}`, () => {
      // Arrange
      const { n, mode } = c;

      // Act
      const line = concurrencyModeRefusal(n, mode);

      // Assert
      strictEqual(line, null);
    });
  }
});

describe("concurrencyGitRefusal", () => {
  it("names the confinement setting, the runtime change that lifts it and the sequential way out", () => {
    // Arrange
    const n = 2;

    // Act
    const line = concurrencyGitRefusal(n);

    // Assert
    assertGitRefusal(line);
  });
});

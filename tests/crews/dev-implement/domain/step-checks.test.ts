// The checks between two acts. Run:
//   node --test tests/crews/dev-implement/domain/step-checks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { addedFailure, changedPaths, failureCount, greenProblem, readCost, redProblem, statusPaths, under } from "../../../../src/crews/dev-implement/domain/step-checks.ts";
import {
  ADDED_FAILURE_CASES, AFTER, BEFORE, COST_CASES, FAILURE_COUNT_CASES, GREEN_CASES, isTest, RED_CASES, UNDER_CASES,
} from "./step-checks.fixtures.ts";

describe("statusPaths", () => {
  it("reads both sides of a rename, unquotes, and leaves .orkeon/ out", () => {
    // Arrange
    const porcelain = ' M src/a.ts\nR  old.ts -> new.ts\n?? "with space.ts"\n?? .orkeon/dev/bin/wait.mjs\n';

    // Act
    const paths = statusPaths(porcelain);

    // Assert
    deepStrictEqual(paths, ["src/a.ts", "old.ts", "new.ts", "with space.ts"]);
  });
});

describe("changedPaths", () => {
  it("names what appeared, vanished, or changed content; a path unread on both sides is not a change", () => {
    // Arrange
    const [before, after] = [BEFORE, AFTER];

    // Act
    const changed = changedPaths(before, after);

    // Assert
    deepStrictEqual(changed, ["b", "d", "e"]);
  });
});

describe("under", () => {
  for (const c of UNDER_CASES) {
    it(c.name, () => {
      // Arrange
      const { path, folder } = c;

      // Act
      const result = under(path, folder);

      // Assert
      strictEqual(result, c.expected);
    });
  }
});

describe("redProblem", () => {
  for (const c of RED_CASES) {
    it(c.name, () => {
      // Arrange
      const { changed, run, stubs } = c;

      // Act
      const problem = redProblem(changed, isTest, run, stubs);

      // Assert
      strictEqual(problem, c.expected);
    });
  }
});

describe("greenProblem", () => {
  for (const c of GREEN_CASES) {
    it(c.name, () => {
      // Arrange
      const { changed, run, before } = c;

      // Act
      const problem = greenProblem(changed, isTest, run, before);

      // Assert
      strictEqual(problem, c.expected);
    });
  }
});

describe("readCost", () => {
  for (const c of FAILURE_COUNT_CASES) {
    it(c.name, () => {
      // Arrange
      const { tail } = c;

      // Act
      const count = failureCount(tail);

      // Assert
      strictEqual(count, c.expected);
    });
  }

  for (const c of ADDED_FAILURE_CASES) {
    it(c.name, () => {
      // Arrange
      const { before, after } = c;

      // Act
      const added = addedFailure(before, after);

      // Assert
      deepStrictEqual(added, c.expected);
    });
  }

  it("reads the line", () => {
    // Arrange
    const answer = "done\nCost: 1 reads, 1 writes; none";

    // Act
    const cost = readCost(answer);

    // Assert
    deepStrictEqual(cost, { ok: true, line: "Cost: 1 reads, 1 writes; none" });
  });

  for (const c of COST_CASES) {
    it(c.name, () => {
      // Arrange
      const { answer } = c;

      // Act
      const cost = readCost(answer);

      // Assert
      strictEqual(cost.ok, c.ok);
    });
  }
});

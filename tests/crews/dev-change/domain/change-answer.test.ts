// checkChangeAnswer: what a change brief's JSON must hold for each kind - a number in a perf criterion, a protected
// behaviour for a refactor, no design words, a TBD backed by a question - and pinOnlyKnown turning an unknown pin
// into unpinned. A feature is routed and not checked.
// Run:  node --test tests/crews/dev-change/domain/change-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { checkChangeAnswer, criterionId, pinOnlyKnown } from "../../../../src/crews/dev-change/domain/change-answer.ts";
import { KINDS, NO_NUMBER, REFUSED_BUG_ANSWERS, THREE_PINS, good } from "./change-answer.fixtures.ts";
import { assertNoProblem, assertProblem } from "./change-answer.assertions.ts";

describe("checkChangeAnswer", () => {
  for (const kind of KINDS) {
    it(`accepts a well-formed brief of the kind ${kind}`, () => {
      // Arrange
      const answer = good();

      // Act
      const result = checkChangeAnswer(answer, kind);

      // Assert
      assertNoProblem(result, kind);
    });
  }

  it("accepts a feature without checks", () => {
    // Arrange
    const answer = { route: "feature" };

    // Act
    const result = checkChangeAnswer(answer, "bug");

    // Assert
    ok(result.ok);
  });

  it("asks a perf change for a number", () => {
    // Arrange
    const answer = NO_NUMBER;

    // Act
    const result = checkChangeAnswer(answer, "perf");

    // Assert
    assertProblem(result, /a number/);
  });

  it("asks a bug for no number", () => {
    // Arrange
    const answer = NO_NUMBER;

    // Act
    const result = checkChangeAnswer(answer, "bug");

    // Assert
    assertNoProblem(result, "bug");
  });

  it("asks a refactor for a protected behaviour", () => {
    // Arrange
    const answer = good({ mustNotChange: [] });

    // Act
    const result = checkChangeAnswer(answer, "refactor");

    // Assert
    assertProblem(result, /must not change/);
  });

  for (const c of REFUSED_BUG_ANSWERS) {
    it(`refuses ${c.name}`, () => {
      // Arrange
      const { answer } = c;

      // Act
      const result = checkChangeAnswer(answer, "bug");

      // Assert
      assertProblem(result, c.problem);
    });
  }
});

describe("criterionId", () => {
  it("numbers the first criterion CH-01", () => {
    // Arrange
    const index = 0;

    // Act
    const id = criterionId(index);

    // Assert
    strictEqual(id, "CH-01");
  });
});

describe("pinOnlyKnown", () => {
  it("keeps a pin the index shows and turns the others unpinned", () => {
    // Arrange
    const answer = THREE_PINS;

    // Act
    const r = pinOnlyKnown(answer, (n) => n === "known test");

    // Assert
    deepStrictEqual(r.answer.mustNotChange.map((m) => m.pinnedBy), ["known test", "unpinned", "unpinned"]);
    deepStrictEqual(r.unknown, ["ghost"]);
  });
});

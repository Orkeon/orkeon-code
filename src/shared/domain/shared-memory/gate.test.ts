// The shared memory's write gate (M-4). Run: node --test src/shared/domain/shared-memory/gate.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { MISTAKE_MIN_BATCHES, admissionProblem, asksConfirmation, sourceKind } from "./gate.ts";
import { ADMITTED, CONFIRMATIONS, REFUSED, SOURCE_KINDS } from "./gate.fixtures.ts";
import { assertProblemSays } from "./gate.assertions.ts";

describe("the write gate", () => {
  for (const c of SOURCE_KINDS) {
    it(`reads the kind of a source: ${c.name}`, () => {
      // Arrange
      const { source } = c;

      // Act
      const kind = sourceKind(source);

      // Assert
      strictEqual(kind, c.kind);
    });
  }

  for (const c of ADMITTED) {
    it(`admits ${c.name}`, () => {
      // Arrange
      const { type, source } = c;

      // Act
      const problem = admissionProblem({ type, source });

      // Assert
      strictEqual(problem, undefined);
    });
  }

  for (const c of REFUSED) {
    it(`refuses ${c.name}, and says why`, () => {
      // Arrange
      const { type, source } = c;

      // Act
      const problem = admissionProblem({ type, source });

      // Assert
      assertProblemSays(problem, c.problem);
    });
  }

  for (const c of CONFIRMATIONS) {
    it(c.name, () => {
      // Arrange
      const { source, auto } = c;

      // Act
      const asks = asksConfirmation({ source }, auto);

      // Assert
      strictEqual(asks, c.asks);
    });
  }

  it("harvests a mistake from three batches", () => {
    // Arrange
    const expected = 3;

    // Act
    const threshold = MISTAKE_MIN_BATCHES;

    // Assert
    strictEqual(threshold, expected);
  });
});

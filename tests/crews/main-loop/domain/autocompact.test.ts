// F3.5 — circuit breaker transitions. Run: node --test src/crews/main-loop/domain/autocompact.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { isBreakerOpen, nextFailureCount } from "../../../../src/crews/main-loop/domain/autocompact.ts";
import { BREAKER_CASES, FAILURE_COUNT_CASES } from "./autocompact.fixtures.ts";

describe("isBreakerOpen", () => {
  for (const c of BREAKER_CASES) {
    it(c.name, () => {
      // Arrange
      const { failures, open } = c;

      // Act
      const result = isBreakerOpen(failures);

      // Assert
      strictEqual(result, open);
    });
  }
});

describe("nextFailureCount", () => {
  for (const c of FAILURE_COUNT_CASES) {
    it(c.name, () => {
      // Arrange
      const { count, outcome, next } = c;

      // Act
      const result = nextFailureCount(count, outcome);

      // Assert
      strictEqual(result, next);
    });
  }
});

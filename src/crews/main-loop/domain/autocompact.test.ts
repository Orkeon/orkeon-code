// F3.5 — circuit breaker transitions. Run: node --test src/crews/main-loop/domain/autocompact.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { isBreakerOpen, nextFailureCount } from "./autocompact.ts";

describe("isBreakerOpen", () => {
  it("stays closed below 3 consecutive failures and opens at 3", () => {
    strictEqual(isBreakerOpen(0), false);
    strictEqual(isBreakerOpen(2), false);
    strictEqual(isBreakerOpen(3), true);
    strictEqual(isBreakerOpen(7), true);
  });
});

describe("nextFailureCount", () => {
  it("increments on failed", () => {
    strictEqual(nextFailureCount(0, "failed"), 1);
    strictEqual(nextFailureCount(2, "failed"), 3);
  });

  it("resets on any success (compacted or snipped)", () => {
    strictEqual(nextFailureCount(2, "compacted"), 0);
    strictEqual(nextFailureCount(2, "snipped"), 0);
  });

  it("leaves the count unchanged on skipped", () => {
    strictEqual(nextFailureCount(0, "skipped"), 0);
    strictEqual(nextFailureCount(2, "skipped"), 2);
  });
});

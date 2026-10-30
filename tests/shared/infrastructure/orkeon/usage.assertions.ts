// The checks of the createUsageReader tests made of more than one native assertion.
import { deepStrictEqual } from "node:assert";
import type { UsageReport, UsageTokens } from "../../../../src/shared/application/ports.ts";
import type { CountTriple } from "./usage.fixtures.ts";

const triple = (t: UsageTokens | undefined): CountTriple | undefined =>
  t === undefined ? undefined : [t.cacheHitTokens, t.cacheWriteTokens, t.reasoningTokens];

/** The cache and reasoning counts of the totals, the first model and the first command are `expected`. */
export function assertCounts(report: UsageReport | undefined, expected: [CountTriple, CountTriple, CountTriple]): void {
  deepStrictEqual(
    [triple(report), triple(report?.byModel[0]), triple(report?.byCommand[0])],
    expected,
    "the cache hit, cache write and reasoning counts of the totals, the first model and the first command",
  );
}

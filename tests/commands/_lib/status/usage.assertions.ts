// The checks of the /usage tests made of more than one native assertion.
import { deepStrictEqual } from "node:assert";
import type { CacheFigures, InOut } from "./usage.fixtures.ts";

/** The row's tokens sent, received and spent reasoning are `expected`. */
export function assertInOut(row: object | undefined, expected: InOut): void {
  const { llmInTokens, llmOutTokens, llmReasoningTokens } = (row ?? {}) as Partial<InOut>;
  deepStrictEqual({ llmInTokens, llmOutTokens, llmReasoningTokens }, expected, "the tokens sent, received and spent reasoning");
}

/** The row's cache read, cache write and cache ratio are `expected`. */
export function assertCacheFigures(row: object | undefined, expected: CacheFigures): void {
  const { cacheRead, cacheWrite, cacheRatio } = (row ?? {}) as Partial<CacheFigures>;
  deepStrictEqual({ cacheRead, cacheWrite, cacheRatio }, expected, "the cache read, write and ratio");
}

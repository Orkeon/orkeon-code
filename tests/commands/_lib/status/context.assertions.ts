// The checks of the /context tests made of more than one native assertion.
import { deepStrictEqual } from "node:assert";
import type { CacheColumns } from "../../../../src/commands/_lib/status/cache.ts";

/** The row's message count and estimated tokens, as /context tables them. */
export interface ContextSize {
  messages: number | "n/a";
  estTokens: number | "n/a";
}

/** The row's message count and estimated tokens are `expected`. */
export function assertContextSize(row: object | undefined, expected: ContextSize): void {
  const { messages, estTokens } = (row ?? {}) as Partial<ContextSize>;
  deepStrictEqual({ messages, estTokens }, expected, "the messages and the estimated tokens");
}

/** The row's cache read and cache write are `expected`. */
export function assertContextCache(row: object | undefined, expected: CacheColumns): void {
  const { cacheRead, cacheWrite } = (row ?? {}) as Partial<CacheColumns>;
  deepStrictEqual({ cacheRead, cacheWrite }, expected, "the cache read and write");
}

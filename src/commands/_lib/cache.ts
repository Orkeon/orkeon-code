// The prompt-cache columns /usage, /context and /stats show (RT-12): the tokens read
// from the provider's cache and written to it, over every model of the session,
// `-` when the host reports none. Lives under commands/_lib/ — the loader's
// SearchPattern is "*.cmd.ts", so this file is never loaded as a command.

import type { SessionStats } from "../../shared/application/ports.ts";

export interface CacheColumns {
  cacheRead: number | "-";
  cacheWrite: number | "-";
}

export function cacheColumns(s: Pick<SessionStats, "cacheHitTokens" | "cacheWriteTokens">): CacheColumns {
  return { cacheRead: s.cacheHitTokens ?? "-", cacheWrite: s.cacheWriteTokens ?? "-" };
}

/** The one row of /stats: the session's counts, the cache columns and the share of the tokens read from the cache. */
export function statsRow(s: SessionStats): Record<string, number | string> {
  const tokens = s.totalTokens ?? 0;
  const cache = cacheColumns(s);
  return {
    messages: s.messageCount ?? 0,
    estTokens: s.estimatedTokens ?? 0,
    costUsd: s.costUsd ?? 0,
    tokens,
    calls: s.totalCalls ?? 0,
    ...cache,
    cacheRatio: cache.cacheRead !== "-" && tokens > 0 ? (cache.cacheRead / tokens).toFixed(2) : "-",
  };
}

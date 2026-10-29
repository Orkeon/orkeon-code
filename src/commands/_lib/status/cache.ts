// The prompt-cache columns /usage and /context show (RT-12): the tokens read
// from the provider's cache and written to it, over every model of the session,
// `-` when the host reports none. Lives under commands/_lib/ — the loader's
// SearchPattern is "*.cmd.ts", so this file is never loaded as a command.

import type { SessionStats } from "../../../shared/application/ports.ts";

export interface CacheColumns {
  cacheRead: number | "-";
  cacheWrite: number | "-";
}

export function cacheColumns(s: Pick<SessionStats, "cacheHitTokens" | "cacheWriteTokens">): CacheColumns {
  return { cacheRead: s.cacheHitTokens ?? "-", cacheWrite: s.cacheWriteTokens ?? "-" };
}

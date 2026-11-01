// The prompt-cache columns /usage and /context show (RT-12): the tokens read
// from the provider's cache and written to it, over every model of the session,
// `n/a` when no model reported the count (Orkeon #254: not measured, never 0). With the host's usage account they
// come from it alone, `n/a` for what it did not measure: never one figure from each source.
// Lives under commands/_lib/ — the loader's SearchPattern is "*.cmd.ts", so this
// file is never loaded as a command.

import type { SessionStats, UsageSpent } from "../../../shared/application/ports.ts";

/** What a column shows for a figure nobody reported: never 0, which would read as measured. */
export const UNREPORTED = "n/a";
export type Unreported = typeof UNREPORTED;

/** A count as a column shows it: the number when measured, 0 included; `n/a` when null or absent. */
export function shown(count: number | null | undefined): number | Unreported {
  return count ?? UNREPORTED;
}

export interface CacheColumns {
  cacheRead: number | Unreported;
  cacheWrite: number | Unreported;
}

/** The cache columns: from the host's account when it keeps one (`report`), else from the telemetry's sums. */
export function cacheColumns(
  s: Pick<SessionStats, "cacheHitTokens" | "cacheWriteTokens">,
  report?: Pick<UsageSpent, "cacheHitTokens" | "cacheWriteTokens">,
): CacheColumns {
  const from = report ?? s;
  return { cacheRead: shown(from.cacheHitTokens), cacheWrite: shown(from.cacheWriteTokens) };
}

// The outcome of one compaction attempt, and the line that reports it. Pure — no IO.
// The pipeline (shared/application/compaction/) returns it, the main-loop circuit
// breaker counts its status, and the session-compact crew prints its line.

/** Status of one compaction attempt; the main-loop circuit breaker counts the
 *  consecutive `failed` ones. */
export type CompactStatus = "skipped" | "snipped" | "compacted" | "failed";

/** Outcome of one compaction attempt — a value, never an exception (the
 *  main-loop circuit breaker consumes `status`). */
export interface CompactOutcome {
  status: CompactStatus;
  reason?: string;
  before?: number;
  after?: number;
  usedTokens?: number;
}

/** Human-readable outcome line (session-compact crew output / logs). */
export function formatOutcome(o: CompactOutcome): string {
  switch (o.status) {
    case "compacted":
      return `✓ compacted ${o.before} → ${o.after} messages` +
        (o.usedTokens !== undefined ? ` (was ~${o.usedTokens} tokens)` : "");
    case "snipped":
      return `✓ micro-compacted (snip) — ${o.before} messages trimmed` +
        (o.usedTokens !== undefined ? `, now ~${o.usedTokens} tokens` : "");
    case "skipped":
      return o.reason === "buffer too small" ? "Buffer too small to compact." : `Compaction skipped (${o.reason}).`;
    default:
      return `Compaction failed: ${o.reason}`;
  }
}

// The outcome of one compaction attempt, and the line that reports it. Pure — no IO.
// The pipeline (shared/application/compaction/) returns it, the main-loop circuit
// breaker counts its status, and the session-compact crew prints its line.
import { BUFFER_TOO_SMALL_TO_COMPACT, noStateFileWritten, SNIPPED_INSTEAD, stateOfBatch } from "./messages.ts";
import { BUFFER_TOO_SMALL } from "./markers.ts";

/** Status of one compaction attempt; the main-loop circuit breaker counts the
 *  consecutive `failed` ones. */
export type CompactStatus = "skipped" | "compacted" | "failed";

/** Outcome of one compaction attempt — a value, never an exception (the
 *  main-loop circuit breaker consumes `status`). */
export interface CompactOutcome {
  status: CompactStatus;
  reason?: string;
  before?: number;
  after?: number;
  usedTokens?: number;
  /** A failed summary whose buffer was snipped instead: the earlier turns removed without a summary. */
  fallback?: "snip";
  /** The state file written before the compaction (a dev batch in progress), or why none was. */
  state?: { path: string } | { skipped: string };
}

/** Human-readable outcome line (session-compact crew output / logs). */
export function formatOutcome(o: CompactOutcome): string {
  return outcomeLine(o) + stateLine(o);
}

function stateLine(o: CompactOutcome): string {
  if (o.state === undefined) return "";
  return "path" in o.state ? stateOfBatch(o.state.path) : noStateFileWritten(o.state.skipped);
}

function outcomeLine(o: CompactOutcome): string {
  switch (o.status) {
    case "compacted":
      return `✓ compacted ${o.before} → ${o.after} messages` +
        (o.usedTokens !== undefined ? ` (was ~${o.usedTokens} tokens)` : "");
    case "skipped":
      return o.reason === BUFFER_TOO_SMALL ? BUFFER_TOO_SMALL_TO_COMPACT : `Compaction skipped (${o.reason}).`;
    default:
      return `Compaction failed: ${o.reason}` +
        (o.fallback === "snip" ? SNIPPED_INSTEAD : "");
  }
}

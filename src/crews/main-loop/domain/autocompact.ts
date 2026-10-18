// Auto-compaction circuit breaker (F3.5) — pure, no IO. The mutable counter
// lives in agent state (ctx.state.with is the ONLY mutation path); these
// helpers hold the testable transition logic. Per the source design, only
// consecutive FAILURES open the breaker: any successful pass (compacted or
// snipped) resets it, a skip leaves it unchanged.
//
// Run tests: node --test src/crews/main-loop/domain/autocompact.test.ts

import { MAX_CONSECUTIVE_FAILURES } from "../../../shared/domain/compaction-thresholds.ts";
import type { CompactStatus } from "../../../shared/domain/compact-outcome.ts";

/** True when auto-compaction must be suppressed (≥ 3 consecutive failures). */
export function isBreakerOpen(failures: number): boolean {
  return failures >= MAX_CONSECUTIVE_FAILURES;
}

/** Next failure count after an attempt: failed → +1, success → 0, skip → unchanged. */
export function nextFailureCount(failures: number, status: CompactStatus): number {
  switch (status) {
    case "failed":
      return failures + 1;
    case "compacted":
    case "snipped":
      return 0;
    default: // "skipped"
      return failures;
  }
}

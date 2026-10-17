// Threshold-gated auto-compaction behind a circuit breaker (F3.2/F3.5), and the
// storage of the breaker's counter. The compaction itself is the shared pipeline
// (shared/application/compaction/), which the entry point binds and passes in.

import type { CompactOutcome } from "../../../shared/domain/compact-outcome.ts";
import type { Logger, RunState, SessionStore } from "../../../shared/application/ports.ts";
import { AUTOCOMPACT_BREAKER_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { isBreakerOpen, nextFailureCount } from "../domain/autocompact.ts";

/** The agent-state field mirroring the counter (the crew's withState sets it to 0). */
export const BREAKER_RUN_FIELD = "consecutiveFailures";

/** What auto-compaction runs on. */
export interface AutoCompactDeps {
  session: Pick<SessionStore, "readState" | "writeState">;
  run: RunState;
  log: Logger;
  /** One threshold-gated compaction attempt (force: false — a no-op below the trigger). */
  compact: () => Promise<CompactOutcome>;
}

/** Read the breaker counter: session state first (persists across /assistant runs,
 *  F3 v2), falling back to per-run agent state when the session store is absent. */
export async function readBreakerFailures(deps: Pick<AutoCompactDeps, "session" | "run">): Promise<number> {
  try {
    const v = await deps.session.readState(AUTOCOMPACT_BREAKER_STATE_KEY);
    if (v != null && v !== "") return Number(v) || 0;
  } catch { /* session store optional (standalone runs) */ }
  return Number(deps.run.read(BREAKER_RUN_FIELD) ?? 0);
}

/** Persist the breaker counter in session state AND mirror it in agent state
 *  (the mirror is the read fallback when the session store is absent). */
export async function writeBreakerFailures(deps: Pick<AutoCompactDeps, "session" | "run">, next: number): Promise<void> {
  try {
    await deps.session.writeState(AUTOCOMPACT_BREAKER_STATE_KEY, String(next));
  } catch { /* session store optional */ }
  await deps.run.write(BREAKER_RUN_FIELD, next);
}

/**
 * Threshold-gated auto-compaction with a circuit breaker (F3.2/F3.5): runs the
 * shared pipeline and tracks consecutive failures in SESSION state (F3 v2 — the
 * counter survives across /assistant invocations and is cleared by
 * /reset-session), mirrored in per-run agent state as the fallback for hosts
 * without session tools.
 */
export async function autoCompactGuarded(deps: AutoCompactDeps): Promise<void> {
  const failures = await readBreakerFailures(deps);
  if (isBreakerOpen(failures)) {
    deps.log.warn(`auto-compact suppressed (breaker open after ${failures} consecutive failures)`);
    return;
  }
  const outcome = await deps.compact();
  if (outcome.status === "failed") deps.log.warn(`auto-compact failed: ${outcome.reason}`);
  else if (outcome.status !== "skipped") deps.log.info(`auto-compact: ${outcome.status}`);
  const next = nextFailureCount(failures, outcome.status);
  if (next !== failures) {
    await writeBreakerFailures(deps, next);
  }
}

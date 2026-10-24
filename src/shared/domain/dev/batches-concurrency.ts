// How many batches /dev-batches runs at once: 1 unless asked, a whole number from 1. Above 1 is refused
// for now: two script agents would write the same /workspace, since a script agent cannot be given a
// working root yet (the follow-up issue "working root for script agents"). Read by the command's
// arguments and by the crew's input. Pure.

export const PARALLEL_FOLLOW_UP = "working root for script agents";

export type Concurrency = { ok: true; value: 1 } | { ok: false; line: string };

/** `concurrency` as given (absent, a number or a digit string): 1, or the one line refusing it. */
export function checkConcurrency(raw: unknown): Concurrency {
  if (raw === undefined || raw === null) return { ok: true, value: 1 };
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\s*\d+\s*$/.test(raw) ? Number(raw.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) return { ok: false, line: `concurrency must be a whole number from 1, not '${String(raw)}'` };
  if (n > 1) {
    return {
      ok: false,
      line: `concurrency ${n} refused: parallel runs wait for a runtime working root for script agents (follow-up issue "${PARALLEL_FOLLOW_UP}"); run with concurrency 1`,
    };
  }
  return { ok: true, value: 1 };
}

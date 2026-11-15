// Where the time of a dev step went: the milliseconds of each named phase, summed over its runs, the phases in the
// order they first started, and the one line the step's summary ends with. Pure: the caller measures, this adds up and
// renders. A timing whose clock never moved (total 0 ms) renders nothing: there is nothing to say.
import {
  TIMING_SEPARATOR, timingAttempts, timingLine as timingText, timingMinutes, timingPasses, timingPhase, timingRounds,
  timingSeconds,
} from "./messages.ts";

/** What a phase run more than once counts: the tries of one call, the rounds of a dialogue, the passes of a write. */
export type RunUnit = "attempt" | "round" | "pass";

export interface PhaseTime { readonly phase: string; readonly ms: number; readonly runs: number; readonly unit: RunUnit }

export type PhaseTiming = readonly PhaseTime[];

export const NO_TIMING: PhaseTiming = [];

/** `timing` with a place for `phase` when it has none yet, run 0 times: a phase takes its place when it starts, so a
 *  phase timed inside another comes after it. */
export function startPhase(timing: PhaseTiming, phase: string, unit: RunUnit = "attempt"): PhaseTiming {
  return timing.some((p) => p.phase === phase) ? timing : [...timing, { phase, ms: 0, runs: 0, unit }];
}

/** `timing` with one run more and `ms` more under `phase` (a negative duration counts as 0), its first unit kept. */
export function recordPhase(timing: PhaseTiming, phase: string, ms: number, unit: RunUnit = "attempt"): PhaseTiming {
  const spent = Math.max(0, ms);
  return startPhase(timing, phase, unit).map((p) => (p.phase === phase ? { ...p, ms: p.ms + spent, runs: p.runs + 1 } : p));
}

export function timingTotalMs(timing: PhaseTiming): number {
  return timing.reduce((sum, p) => sum + p.ms, 0);
}

/** Whole seconds under a minute, minutes and seconds from there. */
export function durationText(ms: number): string {
  const seconds = Math.round(Math.max(0, ms) / 1000);
  if (seconds < 60) return timingSeconds(seconds);
  return timingMinutes(Math.floor(seconds / 60), seconds % 60);
}

const RUNS: Record<RunUnit, (n: number) => string> = { attempt: timingAttempts, round: timingRounds, pass: timingPasses };

/** The summary's timing line, the phases that never ran left out; "" for a timing with no time spent. */
export function timingLine(timing: PhaseTiming): string {
  const ran = timing.filter((p) => p.runs > 0);
  const total = timingTotalMs(ran);
  if (total === 0) return "";
  const phases = ran.map((p) => timingPhase(p.phase, durationText(p.ms), p.runs > 1 ? RUNS[p.unit](p.runs) : ""));
  return timingText(phases.join(TIMING_SEPARATOR), durationText(total));
}

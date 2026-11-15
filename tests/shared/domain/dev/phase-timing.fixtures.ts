// The phases recorded and what the timing holds and says after them.
import type { PhaseTiming, RunUnit } from "../../../../src/shared/domain/dev/phase-timing.ts";

type Run = readonly [phase: string, ms: number, unit?: RunUnit];

/** `runs` recorded first, then `last`: the timing `expected` after it. */
export interface RecordCase { name: string; runs: readonly Run[]; last: Run; expected: PhaseTiming }

export const RECORD_CASES: readonly RecordCase[] = [
  {
    name: "keeps the phases in the order they first ran",
    runs: [["inventory", 3_000], ["draft", 20_000]], last: ["inventory", 1_000],
    expected: [
      { phase: "inventory", ms: 4_000, runs: 2, unit: "attempt" },
      { phase: "draft", ms: 20_000, runs: 1, unit: "attempt" },
    ],
  },
  {
    name: "counts each run of a phase and keeps the unit of its first run",
    runs: [["questions", 10_000, "round"]], last: ["questions", 5_000, "attempt"],
    expected: [{ phase: "questions", ms: 15_000, runs: 2, unit: "round" }],
  },
  {
    name: "counts a negative duration as no time",
    runs: [], last: ["write", -40],
    expected: [{ phase: "write", ms: 0, runs: 1, unit: "attempt" }],
  },
];

export interface StartCase { name: string; runs: readonly Run[]; phase: string; expected: PhaseTiming }

export const START_CASES: readonly StartCase[] = [
  {
    name: "gives a new phase its place, run 0 times",
    runs: [["questions", 2_000, "round"]], phase: "fold",
    expected: [
      { phase: "questions", ms: 2_000, runs: 1, unit: "round" },
      { phase: "fold", ms: 0, runs: 0, unit: "attempt" },
    ],
  },
  {
    name: "leaves a phase that has its place as it is",
    runs: [["draft", 2_000]], phase: "draft",
    expected: [{ phase: "draft", ms: 2_000, runs: 1, unit: "attempt" }],
  },
];

export interface DurationCase { name: string; ms: number; expected: string }

export const DURATION_CASES: readonly DurationCase[] = [
  { name: "says no time as 0 s", ms: 0, expected: "0 s" },
  { name: "rounds a duration to the nearest second", ms: 2_499, expected: "2 s" },
  { name: "says 59 seconds in seconds", ms: 59_000, expected: "59 s" },
  { name: "says a duration rounded up to a minute in minutes", ms: 59_600, expected: "1 min 0 s" },
  { name: "says a duration above a minute in minutes and seconds", ms: 372_000, expected: "6 min 12 s" },
];

/** `runs` recorded, then each phase of `started` started and left unrecorded: the line `expected`. */
export interface LineCase { name: string; runs: readonly Run[]; started?: readonly string[]; expected: string }

export const LINE_CASES: readonly LineCase[] = [
  { name: "says nothing of an empty timing", runs: [], expected: "" },
  { name: "says nothing when no time was spent", runs: [["inventory", 0], ["draft", 0]], expected: "" },
  {
    name: "leaves out a phase that started and never ran",
    runs: [["inventory", 3_000]], started: ["review"],
    expected: "timing: inventory 3 s — total 3 s",
  },
  {
    name: "names each phase with its duration, then the total",
    runs: [["inventory", 3_000], ["review", 372_000], ["write", 200]],
    expected: "timing: inventory 3 s · review 6 min 12 s · write 0 s — total 6 min 15 s",
  },
  {
    name: "counts the attempts, the rounds and the passes of a phase run more than once",
    runs: [
      ["draft", 30_000], ["draft", 28_000], ["questions", 25_000, "round"], ["questions", 15_000, "round"],
      ["write", 100, "pass"], ["write", 100, "pass"],
    ],
    expected: "timing: draft 58 s (2 attempts) · questions 40 s (2 rounds) · write 0 s (2 passes) — total 1 min 38 s",
  },
];

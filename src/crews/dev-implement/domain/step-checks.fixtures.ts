// The runs, paths and Cost lines the checks between two acts are tested on.
import { type addedFailure, type IsTest, type ObservedRun, under } from "./step-checks.ts";

export const red: ObservedRun = { ran: true as const, exit: 1, timedOut: false, log: null };
export const green: ObservedRun = { ran: true as const, exit: 0, timedOut: false, log: null };
export const isTest: IsTest = (p: string): boolean => under(p, "tests") || p.endsWith(".test.ts");

/** Before: a and b read, c and e unread. */
export const BEFORE = new Map<string, string | null>([["a", "1"], ["b", "2"], ["c", null], ["e", null]]);
/** After: a the same, b changed, c still unread, d appeared, e read. */
export const AFTER = new Map<string, string | null>([["a", "1"], ["b", "3"], ["c", null], ["d", "4"], ["e", "5"]]);

export interface UnderCase { name: string; path: string; folder: string; expected: boolean }

export const UNDER_CASES: readonly UnderCase[] = [
  { name: "matches a file of the folder", path: "tests/a.test.ts", folder: "tests/", expected: true },
  { name: "never matches a folder that only starts with the same name", path: "tests2/a.ts", folder: "tests", expected: false },
];

export interface RedCase { name: string; changed: string[]; run: ObservedRun; stubs?: string[]; expected: string | null }

export const RED_CASES: readonly RedCase[] = [
  { name: "holds when only tests changed and they fail", changed: ["tests/a.test.ts"], run: red, expected: null },
  { name: "refuses a production path", changed: ["tests/a.test.ts", "src/a.ts"], run: red, expected: "a production path changed before a red test: src/a.ts" },
  { name: "refuses a green run", changed: ["tests/a.test.ts"], run: green, expected: "the new tests pass at once: a test green before its code is never kept" },
  { name: "refuses a run that did not happen", changed: ["tests/a.test.ts"], run: { ran: false, reason: "refused" }, expected: "the step's tests did not run: refused" },
  { name: "refuses no change", changed: [], run: red, expected: "the test author changed no file" },
  { name: "lets the step's stubs through with a test", changed: ["tests/a.test.ts", "src/a.ts"], run: red, stubs: ["src/a.ts"], expected: null },
  { name: "never lets the step's stubs through alone", changed: ["src/a.ts"], run: red, stubs: ["src/a.ts"], expected: "the test author changed no test file, only stubs: src/a.ts" },
  { name: "lets no other production file through than the step's stubs", changed: ["tests/a.test.ts", "src/b.ts"], run: red, stubs: ["src/a.ts"], expected: "a production path changed before a red test: src/b.ts" },
  { name: "counts a test file beside the code as a test", changed: ["src/a.test.ts"], run: red, expected: null },
];

export interface GreenCase { name: string; changed: string[]; run: ObservedRun; before?: ObservedRun; expected: string | null }

export const GREEN_CASES: readonly GreenCase[] = [
  { name: "holds when no test changed and the tests pass", changed: ["src/a.ts"], run: green, expected: null },
  { name: "refuses a test change", changed: ["src/a.ts", "tests/a.test.ts"], run: green, expected: "a test file changed while turning it green: tests/a.test.ts" },
  { name: "refuses a red run", changed: ["src/a.ts"], run: red, expected: "the step's tests still fail (exit 1)" },
  { name: "refuses a timeout", changed: ["src/a.ts"], run: { ...green, timedOut: true } as ObservedRun, expected: "the step's tests timed out" },
  {
    name: "refuses tests that turn green with no change after a red run",
    changed: [],
    run: green,
    before: red,
    expected: "the implementer changed no file, yet the tests that failed before now pass: a test that turns green by itself is flaky",
  },
  { name: "keeps a resumed green", changed: [], run: green, before: green, expected: null },
];

export interface FailureCountCase { name: string; tail: string; expected: number | null }

export const FAILURE_COUNT_CASES: readonly FailureCountCase[] = [
  { name: "reads node's failure count", tail: "ℹ fail 2", expected: 2 },
  { name: "reads jest's failure count", tail: "Tests: 3 failed, 4 passed", expected: 3 },
  { name: "reads dotnet's failure count", tail: "Failed!  - Failed:     1, Passed: 2", expected: 1 },
  { name: "reads no failure count from a run without one", tail: "all ok", expected: null },
];

export interface AddedFailureCase { name: string; before: string; after: string; expected: ReturnType<typeof addedFailure> }

export const ADDED_FAILURE_CASES: readonly AddedFailureCase[] = [
  {
    name: "refuses new tests that add no failure",
    before: "# fail 1",
    after: "# fail 1",
    expected: { problem: "the new tests add no failure (failures 1 → 1): a test green before its code is never kept" },
  },
  { name: "holds when the new tests add a failure", before: "# fail 1", after: "# fail 2", expected: "ok" },
  { name: "cannot tell without the count of the run before", before: "not ok 1", after: "# fail 2", expected: "unknown" },
];

export interface CostCase { name: string; answer: string; ok: boolean }

export const COST_CASES: readonly CostCase[] = [
  { name: "refuses an answer without a Cost line", answer: "done", ok: false },
  { name: "refuses a Cost line with a read in a loop", answer: "Cost: 3 reads, 0 writes; a read in a loop over entries", ok: false },
  { name: "clears a loop in a where that says no port call sits in one", answer: "Cost: 1 reads, 0 writes; no port call in a loop, a lambda or a memory filter", ok: true },
  { name: "clears a where that says nothing", answer: "Cost: 2 reads, 0 writes; nothing", ok: true },
  { name: "refuses a where with a port call in a loop", answer: "Cost: a port call in a loop, none in a lambda", ok: false },
  { name: "refuses reads in a loop", answer: "Cost: 3 reads in a loop; 1 write", ok: false },
  { name: "refuses a where that takes its no back with a but", answer: "Cost: 1 reads, 0 writes; no port call in a loop, but one in a lambda", ok: false },
  { name: "clears a none followed by its reason after a dash", answer: "Cost: 4 reads, 2 writes; none — no port, no loop over a port call.", ok: true },
  { name: "clears a none followed by its reason after a colon", answer: "Cost: 0 reads, 0 writes; none: pure functions, no loop over a port", ok: true },
  { name: "clears a none followed by its reason in brackets", answer: "Cost: 0 reads, 0 writes; none (no port in any lambda)", ok: true },
  { name: "refuses a none whose reason takes it back with a but", answer: "Cost: 1 reads, 0 writes; none — but a read in a loop over entries", ok: false },
  { name: "refuses a none whose reason takes it back with an except", answer: "Cost: 1 reads, 0 writes; none, except a read in a lambda", ok: false },
  { name: "refuses a none in the loop with one in a lambda", answer: "Cost: 1 reads, 0 writes; none in the loop, one in a lambda", ok: false },
];

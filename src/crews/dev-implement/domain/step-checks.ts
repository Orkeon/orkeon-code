// The hard checks between two acts of a step, on what code observed, never on a role's word: the
// paths the act changed (two snapshots of the tree), and the narrow test run code made after it.
// RED holds when only test files changed and the tests fail; GREEN when no test file changed and
// the tests pass. The implementer's Cost line is read here too. Pure.

/** A tree snapshot: path → hash of its content; null when the content was not read. */
export type Snapshot = ReadonlyMap<string, string | null>;

/** What code's own test run gave: its exit, or why it did not run. */
export type ObservedRun = { ran: true; exit: number; timedOut: boolean; log: string | null } | { ran: false; reason: string };

/** Paths `git status --porcelain=v1` lists: both sides of a rename, quotes removed, `.orkeon/` left out. */
export function statusPaths(porcelain: string): string[] {
  const out: string[] = [];
  for (const raw of porcelain.split("\n")) {
    if (raw.length < 4) continue;
    for (const part of raw.slice(3).split(" -> ")) {
      const path = unquote(part.trim());
      if (path !== "" && !path.startsWith(".orkeon/") && !out.includes(path)) out.push(path);
    }
  }
  return out;
}

function unquote(path: string): string {
  if (!(path.startsWith('"') && path.endsWith('"'))) return path;
  return path.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

/** The paths whose presence or content differs between two snapshots, sorted. */
export function changedPaths(before: Snapshot, after: Snapshot): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((p) => {
    if (!before.has(p) || !after.has(p)) return true;
    const a = before.get(p);
    const b = after.get(p);
    // Unread on both sides (too large, binary, or past the snapshot's cap): not a change code saw; a role's
    // own write to it is still counted, from the paths its write tools named.
    if (a === null && b === null) return false;
    return a !== b;
  }).sort();
}

export { under } from "../../../shared/domain/dev/test-paths.ts";

/** Tells a test file from a production one, by the pack (shared/domain/dev/test-paths.ts). */
export type IsTest = (path: string) => boolean;

function runProblem(run: ObservedRun): string | null {
  if (!run.ran) return `the step's tests did not run: ${run.reason}`;
  if (run.timedOut) return "the step's tests timed out";
  return null;
}

/** Why RED does not hold; null when it does. `stubs` are the production files the step marks `to create`, which
 *  the test author may write as signature stubs. */
export function redProblem(changed: readonly string[], isTest: IsTest, run: ObservedRun, stubs: readonly string[] = []): string | null {
  if (changed.length === 0) return "the test author changed no file";
  const outside = changed.filter((p) => !isTest(p) && !stubs.includes(p));
  if (outside.length > 0) return `a production path changed before a red test: ${outside.join(", ")}`;
  if (!changed.some(isTest)) return `the test author changed no test file, only stubs: ${changed.join(", ")}`;
  const problem = runProblem(run);
  if (problem !== null) return problem;
  if (run.ran && run.exit === 0) return "the new tests pass at once: a test green before its code is never kept";
  return null;
}

const FAILURE_COUNTS = [
  /\b(\d+)\s+(?:failed|failing|failures?)\b/gi,
  /\b(?:failed|failures?|fail)\s*[:=]?\s+(\d+)\b/gi,
];

/** The failure count a test run's tail shows last (`2 failed`, `fail 2`, `Failed: 2`), or null when it shows none. */
export function failureCount(tail: string): number | null {
  let last: { at: number; n: number } | null = null;
  for (const re of FAILURE_COUNTS) {
    for (const m of tail.matchAll(re)) {
      if (last === null || (m.index ?? 0) >= last.at) last = { at: m.index ?? 0, n: Number(m[1]) };
    }
  }
  return last === null ? null : last.n;
}

/** Whether a later RED step of a cycle added a failure: its file failed already (the earlier step's tests), so the
 *  exit code alone cannot tell a new test that passes at once. A problem when both counts are read and none was
 *  added; `unknown` when a count cannot be read. */
export function addedFailure(beforeTail: string, afterTail: string): { problem: string } | "ok" | "unknown" {
  const before = failureCount(beforeTail);
  const after = failureCount(afterTail);
  if (before === null || after === null) return "unknown";
  if (after > before) return "ok";
  return { problem: `the new tests add no failure (failures ${before} → ${after}): a test green before its code is never kept` };
}

/** Why GREEN does not hold; null when it does. `before` is code's run just before the act: tests that failed then
 *  and pass now with no file changed turned green by themselves (flaky), which is never kept. */
export function greenProblem(changed: readonly string[], isTest: IsTest, run: ObservedRun, before?: ObservedRun): string | null {
  const tests = changed.filter(isTest);
  if (tests.length > 0) return `a test file changed while turning it green: ${tests.join(", ")}`;
  const problem = runProblem(run);
  if (problem !== null) return problem;
  if (run.ran && run.exit !== 0) return `the step's tests still fail (exit ${run.exit})`;
  if (changed.length === 0 && before?.ran === true && before.exit !== 0) {
    return "the implementer changed no file, yet the tests that failed before now pass: a test that turns green by itself is flaky";
  }
  return null;
}

export type CostRead = { ok: true; line: string } | { ok: false; problem: string; line?: string };

const BLOCKING_ACCESS = /\b(loops?|lambdas?|memory filters?)\b/i;
const PLACE = "(?:a |any |one )?(?:loops?|lambdas?|memory filters?)";
/** The one "where" that clears a line naming a loop, a lambda or a memory filter: none of them holds a port call. */
const NONE_WHERE = new RegExp(
  `^(?:none|nothing|no port call(?: (?:in|inside|within) ${PLACE}(?:,? (?:or |nor )?${PLACE})*)?)\\.?$`, "i");

/** The implementer's `Cost:` line; refused when absent, or when it names a loop, a lambda or a memory filter
 *  anywhere but in a "where" that says no port call sits in one (`…; none`, `…; no port call in a loop`). */
export function readCost(answer: string): CostRead {
  const match = /^\s*\**Cost\**\s*:\s*(.+)$/im.exec(answer);
  if (match === null) return { ok: false, problem: "the implementer stated no Cost line" };
  const body = match[1].trim();
  const line = `Cost: ${body}`;
  const cut = body.indexOf(";");
  const counts = cut < 0 ? body : body.slice(0, cut);
  const where = cut < 0 ? "" : body.slice(cut + 1).trim();
  if (BLOCKING_ACCESS.test(counts) || (BLOCKING_ACCESS.test(where) && !NONE_WHERE.test(where))) {
    return { ok: false, problem: `a port call in a loop, a lambda or a memory filter: back to /dev-plan (${line})`, line };
  }
  return { ok: true, line };
}

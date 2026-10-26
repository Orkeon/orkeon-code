// Checks on what checkSpecAnswer returns.
import { deepStrictEqual, ok } from "node:assert";
import type { Checked } from "../../../../src/shared/domain/agents/charter.ts";

/** A problem expected: one equal to `is`, starting with `startsWith`, or holding `includes`. */
export type ProblemCheck = { is: string } | { startsWith: string } | { includes: string };

function problemsOf(result: Checked<unknown>): string[] {
  return result.ok ? [] : result.problems;
}

function matches(problem: string, check: ProblemCheck): boolean {
  if ("is" in check) return problem === check.is;
  if ("startsWith" in check) return problem.startsWith(check.startsWith);
  return problem.includes(check.includes);
}

/** The check found no problem. */
export function assertNoProblem(result: Checked<unknown>): void {
  deepStrictEqual(problemsOf(result), []);
}

/** The check found a problem for each of `checks`. */
export function assertProblems(result: Checked<unknown>, checks: readonly ProblemCheck[]): void {
  const problems = problemsOf(result);
  for (const check of checks) {
    ok(problems.some((p) => matches(p, check)), `no problem ${JSON.stringify(check)} in:\n${problems.join("\n")}`);
  }
}

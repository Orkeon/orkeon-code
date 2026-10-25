// Checks on what checkChangeAnswer returns.
import { deepStrictEqual, ok } from "node:assert";
import type { Checked } from "../../../shared/domain/agents/charter.ts";

/** The problems of a check: none when it passed. */
function problemsOf(result: Checked<unknown>): string[] {
  return result.ok ? [] : result.problems;
}

/** The check found no problem. */
export function assertNoProblem(result: Checked<unknown>, what: string): void {
  deepStrictEqual(problemsOf(result), [], what);
}

/** The check found a problem matching `problem`. */
export function assertProblem(result: Checked<unknown>, problem: RegExp): void {
  const problems = problemsOf(result);
  ok(problems.some((p) => problem.test(p)), `no problem matches ${problem}: ${JSON.stringify(problems)}`);
}

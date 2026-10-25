// Checks on what checkPlanAnswer answers.
import { deepStrictEqual, ok } from "node:assert";

import type { Checked } from "../../../shared/domain/agents/charter.ts";

/** The check answered exactly `expected` as its problems: none when it accepted the answer. */
export function assertProblems<T>(r: Checked<T>, expected: readonly string[]): void {
  deepStrictEqual(r.ok ? [] : r.problems, expected, `the check answered ${JSON.stringify(r.ok ? [] : r.problems)}`);
}

/** The check refused the answer, `problem` among its problems. */
export function assertHasProblem<T>(r: Checked<T>, problem: string): void {
  const problems = r.ok ? [] : r.problems;
  ok(problems.includes(problem), `no problem "${problem}" among ${JSON.stringify(problems)}`);
}

/** The check accepted the answer; otherwise fails with its problems. */
export function assertAccepted<T>(r: Checked<T>): asserts r is { ok: true; value: T } {
  if (!r.ok) throw new Error(r.problems.join("\n"));
}

/** The schema's text holds every part of `parts`. */
export function assertSchemaHolds(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `the schema lacks ${part}`);
}

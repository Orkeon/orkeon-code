// Checks on what checkAuditAnswer returns.
import { deepStrictEqual } from "node:assert";
import type { checkAuditAnswer } from "../../../../src/crews/dev-verify/domain/audit-answer.ts";

/** `checked` names exactly `expected`: none when the answer was accepted. */
export function assertProblems(checked: ReturnType<typeof checkAuditAnswer>, expected: readonly string[]): void {
  deepStrictEqual(checked.ok ? [] : checked.problems, expected, "checkAuditAnswer names other problems");
}

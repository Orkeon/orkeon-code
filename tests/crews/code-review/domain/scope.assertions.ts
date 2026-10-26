// Checks on a resolved review scope.
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import type { ReviewScope } from "../../../../src/crews/code-review/domain/scope.ts";

/** `scope` is the bare staged range, its two git commands the ones the crew ran before B-3. */
export function assertBareStagedScope(scope: ReviewScope, label: string): void {
  strictEqual(scope.diffArgs, "--staged", label);
  deepStrictEqual(scope.paths, [], `${label}: no path expected`);
  // `git diff ${diffArgs}` and `git diff ${diffArgs} --name-only` are then
  // exactly the two commands the crew ran before this item.
  strictEqual(`git diff ${scope.diffArgs}`, "git diff --staged", `${label}: the diff command changed`);
  strictEqual(`git diff ${scope.diffArgs} --name-only`, "git diff --staged --name-only", `${label}: the name-only command changed`);
}

/** Every rejection's reason mentions `word`. */
export function assertReasonsMention(rejected: ReviewScope["rejected"], word: string): void {
  for (const r of rejected) ok(r.reason.includes(word), `the reason does not say "${word}": ${r.reason}`);
}

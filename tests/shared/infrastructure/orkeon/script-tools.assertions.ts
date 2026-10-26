// Checks on what a script tool hands the model.
import { strictEqual } from "node:assert";

/** `result` names no /workspace path outside the working root prune-F2: the model sees root paths only. */
export function assertRootPathsOnly(result: unknown): void {
  const shown = JSON.stringify(result);
  strictEqual(/\/workspace\/(?!\.orkeon\/worktrees\/prune-F2)/.test(shown), false, `a /workspace path outside the root: ${shown}`);
}

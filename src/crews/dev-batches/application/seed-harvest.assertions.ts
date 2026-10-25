// Checks on the files a seed writes into a worktree.
import { strictEqual } from "node:assert";
import type { FakeFiles } from "../../../../tests/support/fake-files.ts";

/** Every file of `tree` sits under `base` with its content. */
export function assertHolds(files: FakeFiles, base: string, tree: Record<string, string>): void {
  for (const [path, content] of Object.entries(tree)) strictEqual(files.files.get(`${base}/${path}`), content, `${base}/${path}`);
}

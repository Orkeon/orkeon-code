// A batch's worktree: its name, its branch, and the command that creates it with relative paths. Run:
//   node --test src/shared/domain/git/worktree.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { batchBranch, batchWorktreeName, gitWorktreeAdd, worktreePlace } from "./worktree.ts";

describe("a batch's worktree", () => {
  it("is named <code>-F<n>, on branch batches/<code>/F<n>, under /workspace/.orkeon/worktrees", () => {
    strictEqual(batchWorktreeName("prune", "F2"), "prune-F2");
    strictEqual(batchBranch("prune", "F2"), "batches/prune/F2");
    deepStrictEqual(worktreePlace(batchWorktreeName("prune", "F12")),
      { name: "prune-F12", path: ".orkeon/worktrees/prune-F12", root: "/workspace/.orkeon/worktrees/prune-F12" });
  });

  it("is created with --relative-paths: the .git file names no host path the sandbox lacks", () => {
    strictEqual(gitWorktreeAdd(".orkeon/worktrees/prune-F2", "batches/prune/F2", "feat/prune"),
      "git worktree add --relative-paths -b 'batches/prune/F2' '.orkeon/worktrees/prune-F2' 'feat/prune'");
  });
});

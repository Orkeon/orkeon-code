// A batch's worktree: its name, its branch, and the command that creates it with relative paths. Run:
//   node --test src/shared/domain/git/worktree.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { batchBranch, batchWorktreeName, gitWorktreeAdd, worktreePlace } from "./worktree.ts";
import { BATCH, CODE, PRUNE_F12_PLACE } from "./worktree.fixtures.ts";

describe("a batch's worktree", () => {
  it("is named <code>-F<n>", () => {
    // Arrange
    const code = CODE;

    // Act
    const name = batchWorktreeName(code, BATCH);

    // Assert
    strictEqual(name, "prune-F2");
  });

  it("is on branch batches/<code>/F<n>", () => {
    // Arrange
    const code = CODE;

    // Act
    const branch = batchBranch(code, BATCH);

    // Assert
    strictEqual(branch, "batches/prune/F2");
  });

  it("is under /workspace/.orkeon/worktrees", () => {
    // Arrange
    const name = "prune-F12";

    // Act
    const place = worktreePlace(name);

    // Assert
    deepStrictEqual(place, PRUNE_F12_PLACE);
  });

  it("is created with --relative-paths: the .git file names no host path the sandbox lacks", () => {
    // Arrange
    const path = ".orkeon/worktrees/prune-F2";

    // Act
    const command = gitWorktreeAdd(path, "batches/prune/F2", "feat/prune");

    // Assert
    strictEqual(command, "git worktree add --relative-paths -b 'batches/prune/F2' '.orkeon/worktrees/prune-F2' 'feat/prune'");
  });
});

// A batch's worktree over FakeShell: created under .orkeon/worktrees (never .claude/), removed only when
// nothing in it is lost, and its branch merged by fast-forward on a VALID audit only, never pushed. Run:
//   node --test src/shared/application/git/batch-worktree.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { createBatchWorktree, mergeValidBatch, removeBatchWorktree } from "./batch-worktree.ts";
import { worktreePlace } from "../../domain/git/worktree.ts";
import {
  ADD, BRANCH, COUNT, CREATE, DELETE, DROP, EXISTS, HEAD, HEADS_ELSEWHERE, IGNORED, MERGE, MERGED, NOT_ONE_FOLDER, REBASE,
  REMOVE, REQ, STATUS, UNMERGED_VERDICTS, UNSAFE_CREATES, freshBranch, onBranch, refusingFirstFastForward, shellWith,
} from "./batch-worktree.fixtures.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

describe("worktreePlace", () => {
  it(`is under ${WORKSPACE}/.orkeon/worktrees, never .claude/`, () => {
    // Arrange
    const name = "demo-F2";

    // Act
    const place = worktreePlace(name);

    // Assert
    deepStrictEqual(place, { name: "demo-F2", path: ".orkeon/worktrees/demo-F2", root: `${WORKSPACE}/.orkeon/worktrees/demo-F2` });
  });

  for (const name of NOT_ONE_FOLDER) {
    it(`refuses the name ${JSON.stringify(name)}, which is not one folder`, () => {
      // Arrange
      const requested = name;

      // Act
      const place = worktreePlace(requested);

      // Assert
      strictEqual(place, null, name);
    });
  }
});

describe("createBatchWorktree", () => {
  it("adds the worktree on a new branch from the base", async () => {
    // Arrange
    const shell = freshBranch();

    // Act
    const out = await createBatchWorktree(shell, CREATE);

    // Assert
    ok(out.ok && out.place.root === `${WORKSPACE}/.orkeon/worktrees/demo-F2`);
    deepStrictEqual(shell.commands, [EXISTS, IGNORED, ADD]);
  });

  it("refuses a worktree folder git does not ignore", async () => {
    // Arrange
    const shell = freshBranch({ [IGNORED]: { exitCode: 1 } });

    // Act
    const out = await createBatchWorktree(shell, CREATE);

    // Assert
    deepStrictEqual(out, {
      ok: false, line: "refused: .orkeon/worktrees/demo-F2 is not ignored by git: add `.orkeon/` to .gitignore or .git/info/exclude first",
    });
    deepStrictEqual(shell.commands, [EXISTS, IGNORED]);
  });

  it("refuses a base ref read as an option, running nothing", async () => {
    // Arrange
    const shell = shellWith();

    // Act
    const out = await createBatchWorktree(shell, { ...CREATE, base: "--detach" });

    // Assert
    strictEqual(out.ok, false);
    deepStrictEqual(shell.commands, []);
  });

  it("refuses a branch that exists already", async () => {
    // Arrange
    const shell = shellWith();

    // Act
    const out = await createBatchWorktree(shell, CREATE);

    // Assert
    deepStrictEqual(out, { ok: false, line: "refused: branch batch/demo-F2 exists already: remove it or choose another name" });
    deepStrictEqual(shell.commands, [EXISTS]);
  });

  for (const c of UNSAFE_CREATES) {
    it(`refuses ${c.name}, running nothing`, async () => {
      // Arrange
      const shell = shellWith();

      // Act
      const out = await createBatchWorktree(shell, c.request);

      // Assert
      strictEqual(out.ok, false);
      deepStrictEqual(shell.commands, []);
    });
  }

  it("says git's failure when the worktree is not added", async () => {
    // Arrange
    const shell = freshBranch({ [ADD]: { exitCode: 128, stderr: "fatal: '.orkeon/worktrees/demo-F2' already exists\n" } });

    // Act
    const out = await createBatchWorktree(shell, CREATE);

    // Assert
    deepStrictEqual(out, { ok: false, line: "worktree .orkeon/worktrees/demo-F2 not created: fatal: '.orkeon/worktrees/demo-F2' already exists" });
  });

  it("fails with git's own message on a git without --relative-paths (before 2.48): no fallback", async () => {
    // Arrange
    const shell = freshBranch({
      [ADD]: { exitCode: 129, stderr: "error: unknown option `relative-paths'\nusage: git worktree add [<options>] <path> [<commit-ish>]\n" },
    });

    // Act
    const out = await createBatchWorktree(shell, CREATE);

    // Assert
    deepStrictEqual(out, { ok: false, line: "worktree .orkeon/worktrees/demo-F2 not created: error: unknown option `relative-paths'" });
    deepStrictEqual(shell.commands, [EXISTS, IGNORED, ADD]);
  });
});

describe("removeBatchWorktree", () => {
  it("removes a clean, merged worktree, then its branch with -d, never --force", async () => {
    // Arrange
    const shell = onBranch();

    // Act
    const out = await removeBatchWorktree(shell, DROP);

    // Assert
    deepStrictEqual(out, {
      ok: true, place: worktreePlace("demo-F2"), line: "✓ worktree .orkeon/worktrees/demo-F2 and branch batch/demo-F2 removed",
    });
    deepStrictEqual(shell.commands, [STATUS, HEAD, MERGED, REMOVE, DELETE]);
    ok(shell.commands.every((c) => !c.includes("--force") && !/\bbranch -D\b/.test(c)), shell.commands.join("\n"));
  });

  it("refuses a work branch read as an option, running nothing", async () => {
    // Arrange
    const shell = shellWith();

    // Act
    const out = await removeBatchWorktree(shell, { ...DROP, into: "-q" });

    // Assert
    strictEqual(out.ok, false);
    deepStrictEqual(shell.commands, []);
  });

  it("refuses with uncommitted or untracked files, nothing removed", async () => {
    // Arrange
    const shell = onBranch({ [STATUS]: { stdout: " M src/a.ts\n?? src/b.ts\n" } });

    // Act
    const out = await removeBatchWorktree(shell, DROP);

    // Assert
    deepStrictEqual(out,
      { ok: false, line: "refused: .orkeon/worktrees/demo-F2 holds 2 uncommitted or untracked file(s): commit or discard them first" });
    deepStrictEqual(shell.commands, [STATUS]);
  });

  it("refuses with commits the work branch lacks, nothing removed", async () => {
    // Arrange
    const shell = onBranch({ [MERGED]: { exitCode: 1 }, [COUNT]: { stdout: "3\n" } });

    // Act
    const out = await removeBatchWorktree(shell, DROP);

    // Assert
    deepStrictEqual(out, { ok: false, line: "refused: batch/demo-F2 holds 3 commit(s) not in feat/demo: merge it first" });
    deepStrictEqual(shell.commands, [STATUS, HEAD, MERGED, COUNT]);
  });

  for (const c of HEADS_ELSEWHERE) {
    it(`refuses a worktree on ${c.name}: its commits would go with it`, async () => {
      // Arrange
      const shell = onBranch({ [HEAD]: c.head });

      // Act
      const out = await removeBatchWorktree(shell, DROP);

      // Assert
      ok(!out.ok && out.line.startsWith("refused: .orkeon/worktrees/demo-F2 is not on batch/demo-F2"), out.line);
      deepStrictEqual(shell.commands, [STATUS, HEAD]);
    });
  }

  it("refuses when the worktree's state cannot be read", async () => {
    // Arrange
    const shell = onBranch({ [STATUS]: { exitCode: 128, stderr: "fatal: not a git repository\n" } });

    // Act
    const out = await removeBatchWorktree(shell, DROP);

    // Assert
    strictEqual(out.ok, false);
    deepStrictEqual(shell.commands, [STATUS]);
  });

  it("refuses when git cannot tell whether the branch is merged", async () => {
    // Arrange
    const shell = onBranch({ [MERGED]: { exitCode: 128, stderr: "fatal: Not a valid object name\n" } });

    // Act
    const out = await removeBatchWorktree(shell, DROP);

    // Assert
    strictEqual(out.ok, false);
    deepStrictEqual(shell.commands, [STATUS, HEAD, MERGED]);
  });

  it("keeps a branch git refuses to delete", async () => {
    // Arrange
    const shell = onBranch({ [DELETE]: { exitCode: 1, stderr: "error: the branch 'batch/demo-F2' is not fully merged\n" } });

    // Act
    const out = await removeBatchWorktree(shell, DROP);

    // Assert
    ok(out.ok && out.line.includes("branch batch/demo-F2 kept"));
  });
});

describe("mergeValidBatch", () => {
  it("merges a VALID batch by fast-forward, nothing pushed", async () => {
    // Arrange
    const shell = shellWith({ [BRANCH]: { stdout: "feat/demo\n" } });

    // Act
    const out = await mergeValidBatch(shell, REQ);

    // Assert
    deepStrictEqual(out, { merged: true, rebased: false, line: "batch/demo-F2 merged into feat/demo (fast-forward)" });
    deepStrictEqual(shell.commands, [BRANCH, MERGE]);
  });

  it("rebases in the batch's own worktree when not a fast-forward", async () => {
    // Arrange
    const shell = refusingFirstFastForward();

    // Act
    const out = await mergeValidBatch(shell, REQ);

    // Assert
    strictEqual(out.merged, true);
    ok(shell.commands.includes(REBASE), shell.commands.join("\n"));
  });

  for (const verdict of UNMERGED_VERDICTS) {
    it(`merges nothing for a ${verdict ?? "missing"} verdict`, async () => {
      // Arrange
      const shell = shellWith();

      // Act
      const out = await mergeValidBatch(shell, { ...REQ, verdict });

      // Assert
      strictEqual(out.merged, false);
      ok(!out.merged && out.line.startsWith("not merged: F2's audit is "), out.line);
      deepStrictEqual(shell.commands, []);
    });
  }
});

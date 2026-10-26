// The fast-forward merge of a batch branch (R-16) over FakeShell. Run:
//   node --test src/shared/application/git/merge-batch.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { mergeFastForward } from "./merge-batch.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { ABORT, BRANCH, MERGE, NOT_FF, OPTION_LIKE_REFS, REBASE, REQ, onWorkBranch, refusingFirstMerge } from "./merge-batch.fixtures.ts";

describe("mergeFastForward", () => {
  it("1. merges by fast-forward on the work branch, nothing else run", async () => {
    // Arrange
    const shell = onWorkBranch();

    // Act
    const out = await mergeFastForward(shell, REQ);

    // Assert
    deepStrictEqual(out, { merged: true, rebased: false, line: "agent-1 merged into feat/x (fast-forward)" });
    deepStrictEqual(shell.commands, [BRANCH, MERGE]);
  });

  it("2. not a fast-forward: rebases the batch in its worktree, then merges", async () => {
    // Arrange
    const shell = refusingFirstMerge();

    // Act
    const out = await mergeFastForward(shell, REQ);

    // Assert
    deepStrictEqual(out, { merged: true, rebased: true, line: "agent-1 rebased on feat/x and merged (fast-forward)" });
    deepStrictEqual(shell.commands, [BRANCH, MERGE, REBASE, MERGE]);
  });

  it("3. a rebase conflict aborts the rebase and hands the merge over", async () => {
    // Arrange
    const shell = onWorkBranch({ [MERGE]: NOT_FF, [REBASE]: { exitCode: 1, stderr: "CONFLICT (content): Merge conflict in a.ts\n" } });

    // Act
    const out = await mergeFastForward(shell, REQ);

    // Assert
    deepStrictEqual(out, {
      merged: false, line: "not merged, the rebase stopped (CONFLICT (content): Merge conflict in a.ts); rebase aborted",
      handOver: [REBASE, MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH, MERGE, REBASE, ABORT]);
  });

  it("4. still no fast-forward after the rebase: handed over, nothing forced", async () => {
    // Arrange
    const shell = onWorkBranch({ [MERGE]: NOT_FF });

    // Act
    const out = await mergeFastForward(shell, REQ);

    // Assert
    deepStrictEqual(out, {
      merged: false, line: "not merged after the rebase: fatal: Not possible to fast-forward, aborting.", handOver: [MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH, MERGE, REBASE, MERGE]);
  });

  it("5. without a worktree nothing is rewritten: the merge is handed over", async () => {
    // Arrange
    const shell = onWorkBranch({ [MERGE]: NOT_FF });

    // Act
    const out = await mergeFastForward(shell, { ref: "agent-1", workBranch: "feat/x" });

    // Assert
    deepStrictEqual(out, {
      merged: false, line: "not merged: fatal: Not possible to fast-forward, aborting.",
      handOver: ["git rebase feat/x agent-1", "git checkout feat/x", MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH, MERGE]);
  });

  it("6. another failure (a runtime refusal, a dirty tree) is said as it is, with no rebase", async () => {
    // Arrange
    const shell = onWorkBranch();
    shell.errors[MERGE] = new Error("command not allowed: git merge");

    // Act
    const out = await mergeFastForward(shell, REQ);

    // Assert
    deepStrictEqual(out, {
      merged: false, line: "not merged: refused by the runtime: command not allowed: git merge", handOver: [MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH, MERGE]);
  });

  it("7. the checkout is not on the work branch: nothing merged", async () => {
    // Arrange
    const shell = onWorkBranch({ [BRANCH]: { stdout: "main\n" } });

    // Act
    const out = await mergeFastForward(shell, REQ);

    // Assert
    deepStrictEqual(out, {
      merged: false, line: "not merged: the checkout is on 'main', not on feat/x", handOver: ["git checkout feat/x", MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH]);
  });

  it("7. a name the shell cannot carry: nothing merged, nothing run", async () => {
    // Arrange
    const shell = new FakeShell();

    // Act
    const out = await mergeFastForward(shell, { ref: "a;b", workBranch: "feat/x" });

    // Assert
    deepStrictEqual(out.merged, false);
    deepStrictEqual(shell.commands, []);
  });

  for (const c of OPTION_LIKE_REFS) {
    it(`8. ${c.name} with a leading '-', which git would read as an option: nothing run`, async () => {
      // Arrange
      const shell = onWorkBranch();

      // Act
      const out = await mergeFastForward(shell, c.request);

      // Assert
      deepStrictEqual([out.merged, out.line, shell.commands], [false, c.line, []]);
    });
  }
});

// The fast-forward merge of a batch branch (R-16) over FakeShell. Run:
//   node --test src/shared/application/git/merge-batch.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { mergeFastForward } from "./merge-batch.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const BRANCH = "git branch --show-current";
const MERGE = "git merge --ff-only 'agent-1'";
const REBASE = "git -C '/w/agent-1' rebase 'feat/x'";
const ABORT = "git -C '/w/agent-1' rebase --abort";
const NOT_FF = { exitCode: 128, stderr: "fatal: Not possible to fast-forward, aborting.\n" };
const REQ = { ref: "agent-1", workBranch: "feat/x", worktree: "/w/agent-1" };

function onWorkBranch(): FakeShell {
  const shell = new FakeShell();
  shell.results[BRANCH] = { stdout: "feat/x\n" };
  return shell;
}

describe("mergeFastForward", () => {
  it("1. merges by fast-forward on the work branch, nothing else run", async () => {
    const shell = onWorkBranch();
    deepStrictEqual(await mergeFastForward(shell, REQ), { merged: true, rebased: false, line: "agent-1 merged into feat/x (fast-forward)" });
    deepStrictEqual(shell.commands, [BRANCH, MERGE]);
  });

  it("2. not a fast-forward: rebases the batch in its worktree, then merges", async () => {
    const shell = onWorkBranch();
    let calls = 0;
    const run = shell.run.bind(shell);
    shell.run = async (c, o) => (c === MERGE && calls++ === 0 ? { stdout: "", ...NOT_FF } : run(c, o));
    deepStrictEqual(await mergeFastForward(shell, REQ), { merged: true, rebased: true, line: "agent-1 rebased on feat/x and merged (fast-forward)" });
    deepStrictEqual(shell.commands, [BRANCH, REBASE, MERGE]);
  });

  it("3. a rebase conflict aborts the rebase and hands the merge over", async () => {
    const shell = onWorkBranch();
    shell.results[MERGE] = NOT_FF;
    shell.results[REBASE] = { exitCode: 1, stderr: "CONFLICT (content): Merge conflict in a.ts\n" };
    deepStrictEqual(await mergeFastForward(shell, REQ), {
      merged: false, line: "not merged, the rebase stopped (CONFLICT (content): Merge conflict in a.ts); rebase aborted",
      handOver: [REBASE, MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH, MERGE, REBASE, ABORT]);
  });

  it("4. still no fast-forward after the rebase: handed over, nothing forced", async () => {
    const shell = onWorkBranch();
    shell.results[MERGE] = NOT_FF;
    deepStrictEqual(await mergeFastForward(shell, REQ), {
      merged: false, line: "not merged after the rebase: fatal: Not possible to fast-forward, aborting.", handOver: [MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH, MERGE, REBASE, MERGE]);
  });

  it("5. without a worktree nothing is rewritten: the merge is handed over", async () => {
    const shell = onWorkBranch();
    shell.results[MERGE] = NOT_FF;
    deepStrictEqual(await mergeFastForward(shell, { ref: "agent-1", workBranch: "feat/x" }), {
      merged: false, line: "not merged: fatal: Not possible to fast-forward, aborting.",
      handOver: ["git rebase feat/x agent-1", "git checkout feat/x", MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH, MERGE]);
  });

  it("6. another failure (a runtime refusal, a dirty tree) is said as it is, with no rebase", async () => {
    const shell = onWorkBranch();
    shell.errors[MERGE] = new Error("command not allowed: git merge");
    deepStrictEqual(await mergeFastForward(shell, REQ), {
      merged: false, line: "not merged: refused by the runtime: command not allowed: git merge", handOver: [MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH, MERGE]);
  });

  it("7. the checkout is not on the work branch, or a name the shell cannot carry: nothing merged", async () => {
    const shell = new FakeShell();
    shell.results[BRANCH] = { stdout: "main\n" };
    deepStrictEqual(await mergeFastForward(shell, REQ), {
      merged: false, line: "not merged: the checkout is on 'main', not on feat/x", handOver: ["git checkout feat/x", MERGE],
    });
    deepStrictEqual(shell.commands, [BRANCH]);
    const unsafe = new FakeShell();
    deepStrictEqual((await mergeFastForward(unsafe, { ref: "a;b", workBranch: "feat/x" })).merged, false);
    deepStrictEqual(unsafe.commands, []);
  });
});

// A batch's worktree over FakeShell: created under .orkeon/worktrees (never .claude/), removed only when
// nothing in it is lost, and its branch merged by fast-forward on a VALID audit only, never pushed. Run:
//   node --test src/shared/application/git/batch-worktree.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { createBatchWorktree, mergeValidBatch, removeBatchWorktree } from "./batch-worktree.ts";
import { worktreePlace } from "../../domain/git/worktree.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const EXISTS = "git rev-parse --verify --quiet 'refs/heads/batch/demo-F2'";
const ADD = "git worktree add --relative-paths -b 'batch/demo-F2' '.orkeon/worktrees/demo-F2' 'feat/demo'";
const IGNORED = "git check-ignore -q '.orkeon/worktrees/demo-F2'";
const HEAD = "git -C '.orkeon/worktrees/demo-F2' symbolic-ref -q HEAD";
const STATUS = "git -C '.orkeon/worktrees/demo-F2' status --porcelain --untracked-files=all";
const MERGED = "git merge-base --is-ancestor 'refs/heads/batch/demo-F2' 'feat/demo'";
const COUNT = "git rev-list --count 'refs/heads/batch/demo-F2' --not 'feat/demo'";
const REMOVE = "git worktree remove '.orkeon/worktrees/demo-F2'";
const DELETE = "git branch -d 'batch/demo-F2'";
const CREATE = { name: "demo-F2", branch: "batch/demo-F2", base: "feat/demo" };
const DROP = { name: "demo-F2", branch: "batch/demo-F2", into: "feat/demo" };

describe("worktreePlace", () => {
  it("is under /workspace/.orkeon/worktrees, never .claude/, and refuses a name that is not one folder", () => {
    deepStrictEqual(worktreePlace("demo-F2"), { name: "demo-F2", path: ".orkeon/worktrees/demo-F2", root: "/workspace/.orkeon/worktrees/demo-F2" });
    for (const name of ["", "a/b", "..", "a..b", "-x", ".claude", "../.claude/worktrees/x"]) strictEqual(worktreePlace(name), null, name);
  });
});

describe("createBatchWorktree", () => {
  it("adds the worktree on a new branch from the base", async () => {
    const shell = new FakeShell();
    shell.results[EXISTS] = { exitCode: 1 };
    const out = await createBatchWorktree(shell, CREATE);
    ok(out.ok && out.place.root === "/workspace/.orkeon/worktrees/demo-F2");
    deepStrictEqual(shell.commands, [EXISTS, IGNORED, ADD]);
  });

  it("refuses a worktree folder git does not ignore, and a ref read as an option", async () => {
    const shell = new FakeShell();
    shell.results[EXISTS] = { exitCode: 1 };
    shell.results[IGNORED] = { exitCode: 1 };
    deepStrictEqual(await createBatchWorktree(shell, CREATE), {
      ok: false, line: "refused: .orkeon/worktrees/demo-F2 is not ignored by git: add `.orkeon/` to .gitignore or .git/info/exclude first",
    });
    deepStrictEqual(shell.commands, [EXISTS, IGNORED]);
    const option = new FakeShell();
    strictEqual((await createBatchWorktree(option, { ...CREATE, base: "--detach" })).ok, false);
    strictEqual((await removeBatchWorktree(option, { ...DROP, into: "-q" })).ok, false);
    deepStrictEqual(option.commands, []);
  });

  it("refuses a branch that exists, a bad name or an unsafe ref, and says git's failure", async () => {
    const taken = new FakeShell();
    deepStrictEqual(await createBatchWorktree(taken, CREATE),
      { ok: false, line: "refused: branch batch/demo-F2 exists already: remove it or choose another name" });
    deepStrictEqual(taken.commands, [EXISTS]);
    const bad = new FakeShell();
    strictEqual((await createBatchWorktree(bad, { ...CREATE, name: "../x" })).ok, false);
    strictEqual((await createBatchWorktree(bad, { ...CREATE, base: "a;b" })).ok, false);
    deepStrictEqual(bad.commands, []);
    const failing = new FakeShell();
    failing.results[EXISTS] = { exitCode: 1 };
    failing.results[ADD] = { exitCode: 128, stderr: "fatal: '.orkeon/worktrees/demo-F2' already exists\n" };
    deepStrictEqual(await createBatchWorktree(failing, CREATE),
      { ok: false, line: "worktree .orkeon/worktrees/demo-F2 not created: fatal: '.orkeon/worktrees/demo-F2' already exists" });
  });

  it("fails with git's own message on a git without --relative-paths (before 2.48): no fallback", async () => {
    const old = new FakeShell();
    old.results[EXISTS] = { exitCode: 1 };
    old.results[ADD] = { exitCode: 129, stderr: "error: unknown option `relative-paths'\nusage: git worktree add [<options>] <path> [<commit-ish>]\n" };
    deepStrictEqual(await createBatchWorktree(old, CREATE),
      { ok: false, line: "worktree .orkeon/worktrees/demo-F2 not created: error: unknown option `relative-paths'" });
    deepStrictEqual(old.commands, [EXISTS, IGNORED, ADD]);
  });
});

const onBranch = (): FakeShell => {
  const shell = new FakeShell();
  shell.results[HEAD] = { stdout: "refs/heads/batch/demo-F2\n" };
  return shell;
};

describe("removeBatchWorktree", () => {
  it("removes a clean, merged worktree, then its branch with -d, never --force", async () => {
    const shell = onBranch();
    deepStrictEqual(await removeBatchWorktree(shell, DROP), {
      ok: true, place: worktreePlace("demo-F2"), line: "✓ worktree .orkeon/worktrees/demo-F2 and branch batch/demo-F2 removed",
    });
    deepStrictEqual(shell.commands, [STATUS, HEAD, MERGED, REMOVE, DELETE]);
    ok(shell.commands.every((c) => !c.includes("--force") && !/\bbranch -D\b/.test(c)));
  });

  it("refuses with uncommitted or untracked files, nothing removed", async () => {
    const shell = onBranch();
    shell.results[STATUS] = { stdout: " M src/a.ts\n?? src/b.ts\n" };
    deepStrictEqual(await removeBatchWorktree(shell, DROP),
      { ok: false, line: "refused: .orkeon/worktrees/demo-F2 holds 2 uncommitted or untracked file(s): commit or discard them first" });
    deepStrictEqual(shell.commands, [STATUS]);
  });

  it("refuses with commits the work branch lacks, nothing removed", async () => {
    const shell = onBranch();
    shell.results[MERGED] = { exitCode: 1 };
    shell.results[COUNT] = { stdout: "3\n" };
    deepStrictEqual(await removeBatchWorktree(shell, DROP),
      { ok: false, line: "refused: batch/demo-F2 holds 3 commit(s) not in feat/demo: merge it first" });
    deepStrictEqual(shell.commands, [STATUS, HEAD, MERGED, COUNT]);
  });

  it("refuses a worktree on a detached HEAD or another branch: its commits would go with it", async () => {
    for (const head of [{ exitCode: 1 }, { stdout: "refs/heads/other\n" }]) {
      const shell = onBranch();
      shell.results[HEAD] = head;
      const out = await removeBatchWorktree(shell, DROP);
      ok(!out.ok && out.line.startsWith("refused: .orkeon/worktrees/demo-F2 is not on batch/demo-F2"), out.line);
      deepStrictEqual(shell.commands, [STATUS, HEAD]);
    }
  });

  it("refuses when the state cannot be read, and keeps a branch git refuses to delete", async () => {
    const unreadable = onBranch();
    unreadable.results[STATUS] = { exitCode: 128, stderr: "fatal: not a git repository\n" };
    strictEqual((await removeBatchWorktree(unreadable, DROP)).ok, false);
    deepStrictEqual(unreadable.commands, [STATUS]);
    const unknown = onBranch();
    unknown.results[MERGED] = { exitCode: 128, stderr: "fatal: Not a valid object name\n" };
    strictEqual((await removeBatchWorktree(unknown, DROP)).ok, false);
    deepStrictEqual(unknown.commands, [STATUS, HEAD, MERGED]);
    const kept = onBranch();
    kept.results[DELETE] = { exitCode: 1, stderr: "error: the branch 'batch/demo-F2' is not fully merged\n" };
    const out = await removeBatchWorktree(kept, DROP);
    ok(out.ok && out.line.includes("branch batch/demo-F2 kept"));
  });
});

describe("mergeValidBatch", () => {
  const BRANCH = "git branch --show-current";
  const MERGE = "git merge --ff-only 'batch/demo-F2'";
  const REQ = { batch: "F2", verdict: "VALID", branch: "batch/demo-F2", workBranch: "feat/demo", name: "demo-F2" };

  it("merges a VALID batch by fast-forward, nothing pushed", async () => {
    const shell = new FakeShell();
    shell.results[BRANCH] = { stdout: "feat/demo\n" };
    deepStrictEqual(await mergeValidBatch(shell, REQ),
      { merged: true, rebased: false, line: "batch/demo-F2 merged into feat/demo (fast-forward)" });
    deepStrictEqual(shell.commands, [BRANCH, MERGE]);
  });

  it("rebases in the batch's own worktree when not a fast-forward", async () => {
    const shell = new FakeShell();
    shell.results[BRANCH] = { stdout: "feat/demo\n" };
    let calls = 0;
    const run = shell.run.bind(shell);
    shell.run = async (c, o) => (c === MERGE && calls++ === 0 ? { stdout: "", stderr: "fatal: Not possible to fast-forward, aborting.\n", exitCode: 128 } : run(c, o));
    strictEqual((await mergeValidBatch(shell, REQ)).merged, true);
    ok(shell.commands.includes("git -C '.orkeon/worktrees/demo-F2' rebase 'feat/demo'"));
  });

  it("merges nothing for a GAPS, BLOCKED or missing verdict", async () => {
    for (const verdict of ["GAPS", "BLOCKED", null]) {
      const shell = new FakeShell();
      const out = await mergeValidBatch(shell, { ...REQ, verdict });
      strictEqual(out.merged, false);
      ok(!out.merged && out.line.startsWith("not merged: F2's audit is "));
      deepStrictEqual(shell.commands, []);
    }
  });
});

// Commands, requests and scripted shells for the batch worktree tests: the batch demo-F2 of the work branch feat/demo.
import type { ShellResult } from "../ports.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";

export const EXISTS = "git rev-parse --verify --quiet 'refs/heads/batch/demo-F2'";
export const ADD = "git worktree add --relative-paths -b 'batch/demo-F2' '.orkeon/worktrees/demo-F2' 'feat/demo'";
export const IGNORED = "git check-ignore -q '.orkeon/worktrees/demo-F2'";
export const HEAD = "git -C '.orkeon/worktrees/demo-F2' symbolic-ref -q HEAD";
export const STATUS = "git -C '.orkeon/worktrees/demo-F2' status --porcelain --untracked-files=all";
export const MERGED = "git merge-base --is-ancestor 'refs/heads/batch/demo-F2' 'feat/demo'";
export const COUNT = "git rev-list --count 'refs/heads/batch/demo-F2' --not 'feat/demo'";
export const REMOVE = "git worktree remove '.orkeon/worktrees/demo-F2'";
export const DELETE = "git branch -d 'batch/demo-F2'";
export const BRANCH = "git branch --show-current";
export const MERGE = "git merge --ff-only 'batch/demo-F2'";
export const REBASE = "git -C '.orkeon/worktrees/demo-F2' rebase 'feat/demo'";

export const CREATE = { name: "demo-F2", branch: "batch/demo-F2", base: "feat/demo" };
export const DROP = { name: "demo-F2", branch: "batch/demo-F2", into: "feat/demo" };
export const REQ = { batch: "F2", verdict: "VALID", branch: "batch/demo-F2", workBranch: "feat/demo", name: "demo-F2" };

/** Names worktreePlace refuses: none is one plain folder. */
export const NOT_ONE_FOLDER: readonly string[] = ["", "a/b", "..", "a..b", "-x", ".claude", "../.claude/worktrees/x"];

/** Creation requests refused before git runs: an unsafe name or ref. */
export const UNSAFE_CREATES = [
  { name: "a name that climbs out of the worktrees folder", request: { ...CREATE, name: "../x" } },
  { name: "a base ref holding a shell separator", request: { ...CREATE, base: "a;b" } },
] as const;

/** A worktree whose HEAD is not on its batch branch. */
export const HEADS_ELSEWHERE: ReadonlyArray<{ name: string; head: Partial<ShellResult> }> = [
  { name: "a detached HEAD", head: { exitCode: 1 } },
  { name: "another branch", head: { stdout: "refs/heads/other\n" } },
];

/** Verdicts under which nothing is merged. */
export const UNMERGED_VERDICTS: ReadonlyArray<string | null> = ["GAPS", "BLOCKED", null];

/** A shell answering `results` over the empty, successful default. */
export function shellWith(results: Record<string, Partial<ShellResult>> = {}): FakeShell {
  const shell = new FakeShell();
  Object.assign(shell.results, results);
  return shell;
}

/** A shell where the batch branch does not exist yet. */
export function freshBranch(results: Record<string, Partial<ShellResult>> = {}): FakeShell {
  return shellWith({ [EXISTS]: { exitCode: 1 }, ...results });
}

/** A shell whose worktree HEAD is on the batch branch, clean and merged unless `results` says otherwise. */
export function onBranch(results: Record<string, Partial<ShellResult>> = {}): FakeShell {
  return shellWith({ [HEAD]: { stdout: "refs/heads/batch/demo-F2\n" }, ...results });
}

/** A shell on the work branch whose first fast-forward merge git refuses, the next ones passing. */
export function refusingFirstFastForward(): FakeShell {
  const shell = shellWith({ [BRANCH]: { stdout: "feat/demo\n" } });
  let calls = 0;
  const run = shell.run.bind(shell);
  shell.run = async (c, o) =>
    c === MERGE && calls++ === 0 ? { stdout: "", stderr: "fatal: Not possible to fast-forward, aborting.\n", exitCode: 128 } : run(c, o);
  return shell;
}

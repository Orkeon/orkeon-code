// Commands, requests and scripted shells for the fast-forward merge tests: the batch agent-1 into feat/x.
import type { ShellResult } from "../ports.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";

export const BRANCH = "git branch --show-current";
export const MERGE = "git merge --ff-only 'agent-1'";
export const REBASE = "git -C '/w/agent-1' rebase 'feat/x'";
export const ABORT = "git -C '/w/agent-1' rebase --abort";
export const NOT_FF = { exitCode: 128, stderr: "fatal: Not possible to fast-forward, aborting.\n" };
export const REQ = { ref: "agent-1", workBranch: "feat/x", worktree: "/w/agent-1" };

/** A checkout on the work branch feat/x, answering `results` over the empty, successful default. */
export function onWorkBranch(results: Record<string, Partial<ShellResult>> = {}): FakeShell {
  const shell = new FakeShell();
  Object.assign(shell.results, { [BRANCH]: { stdout: "feat/x\n" } }, results);
  return shell;
}

/** A checkout on the work branch whose first fast-forward merge git refuses, the next ones passing. */
export function refusingFirstMerge(): FakeShell {
  const shell = onWorkBranch();
  let calls = 0;
  shell.answer = (c) => (c === MERGE && calls++ === 0 ? { stdout: "", ...NOT_FF } : undefined);
  return shell;
}

/** Requests naming a ref git would read as an option, and the line each is refused with. */
export const OPTION_LIKE_REFS = [
  { name: "a batch ref", request: { ref: "--detach", workBranch: "feat/x" }, line: "not merged: --detach cannot go through the shell" },
  { name: "a work branch", request: { ref: "agent-1", workBranch: "-b" }, line: "not merged: -b cannot go through the shell" },
] as const;

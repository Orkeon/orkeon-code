// The porcelain outputs, branch names and scripted git answers the /branch tests run over.
import { runBranch } from "../src/commands/_lib/branch.ts";
import type { ShellResult } from "../src/shared/application/ports.ts";
import type { CommandView } from "../src/commands/_lib/view.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakeShell } from "./support/fake-shell.ts";

export const DIRTY_OUTPUTS: readonly { name: string; porcelain: string }[] = [
  { name: "a modified path", porcelain: " M src/index.ts" },
  { name: "an untracked path then a modified one", porcelain: "?? new.ts\n M old.ts" },
];

export const CLEAN_OUTPUTS: readonly unknown[] = ["", "   ", "\n\n", null, undefined];

/** Three changed paths: two modified, one untracked. */
export const THREE_CHANGES = [" M a.ts", " M b.ts", "?? c.ts"].join("\n");

/** Nine modified paths, more than the sample shows. */
export const NINE_CHANGES = Array.from({ length: 9 }, (_, i) => ` M f${i}.ts`).join("\n");

export const SHELL_META_NAMES: readonly string[] = ["a;b", "$(id)"];

export const GOOD_NAMES: readonly string[] = ["main", "feature/x-1", "release-1.2", "user_x"];

export interface BranchHarness {
  shell: FakeShell;
  log: FakeLogger;
  /** Runs `/branch <tokens…>`. */
  run(...tokens: string[]): Promise<CommandView>;
}

/** /branch over a FakeShell scripted with `results` (command line → answer) and a FakeLogger. */
export function branchHarness(results: Record<string, Partial<ShellResult>> = {}): BranchHarness {
  const shell = new FakeShell();
  shell.results = { ...results };
  const log = new FakeLogger();
  return { shell, log, run: (...tokens) => runBranch(tokens, { shell, log }) };
}

export interface GitAnswerCase {
  name: string;
  answer: Partial<ShellResult>;
  text: string;
}

/** What `git branch --show-current` answers, and what a bare /branch shows then. */
export const SHOW_CASES: readonly GitAnswerCase[] = [
  { name: "shows the current branch", answer: { stdout: "main\n" }, text: "main" },
  { name: "shows git's message when it fails", answer: { stderr: "fatal: no repo\n", exitCode: 128 }, text: "fatal: no repo" },
  { name: "shows a detached HEAD when git names no branch", answer: {}, text: "(detached HEAD)" },
];

/** What `git checkout feature` answers on a clean tree, and what /branch says then. */
export const CLEAN_CHECKOUT_CASES: readonly GitAnswerCase[] = [
  { name: "checks out on a clean tree, with git's message", answer: { stderr: "Switched to branch 'feature'\n" }, text: "Switched to branch 'feature'" },
  { name: "checks out on a clean tree, with its own message when git says nothing", answer: {}, text: "switched to 'feature'" },
];

/** What a failed `git checkout feature` answers, the status unreadable, and what /branch reports. */
export const FAILED_CHECKOUT_CASES: readonly GitAnswerCase[] = [
  {
    name: "checks out when the status cannot be read, and reports git's message for a failed checkout",
    answer: { exitCode: 1, stderr: "error: pathspec 'feature' did not match\n" },
    text: "checkout failed: error: pathspec 'feature' did not match",
  },
  {
    name: "checks out when the status cannot be read, and reports the exit code of a silent failed checkout",
    answer: { exitCode: 1 },
    text: "checkout failed: exit code 1",
  },
];

/** A status that cannot be read: it names a change, but git failed. */
export const UNREADABLE_STATUS: Partial<ShellResult> = { stdout: " M a.ts", exitCode: 128 };

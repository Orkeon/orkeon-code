// The tokens /diff is tested on, and the harness runDiff runs over (FakeShell, FakeLogger).
import { runDiff } from "../../../../src/commands/_lib/git/diff.ts";
import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import type { ShellResult } from "../../../../src/shared/application/ports.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";

/** The flags a diff reader actually uses. */
export const READER_FLAGS: readonly string[] = ["--stat", "--name-only", "-p", "--word-diff"];

export const PATHSPEC_CASES: readonly { name: string; tokens: string[]; args: string }[] = [
  { name: "a path alone", tokens: ["src/index.ts"], args: "-- src/index.ts" },
  { name: "a path after a flag", tokens: ["--stat", "src/"], args: "--stat -- src/" },
];

export const BAD_PATHSPECS: readonly string[] = ["../etc/passwd", "a;b", "$(id)", "a|b", "a b\tc"];

export interface DiffHarness {
  shell: FakeShell;
  log: FakeLogger;
  /** Runs `/diff <tokens…>`. */
  run(...tokens: string[]): Promise<CommandView>;
}

/** /diff over a FakeShell scripted with `results` (command line → answer) and a FakeLogger. */
export function diffHarness(results: Record<string, Partial<ShellResult>> = {}): DiffHarness {
  const shell = new FakeShell();
  shell.results = { ...results };
  const log = new FakeLogger();
  return { shell, log, run: (...tokens) => runDiff(tokens, { shell, log }) };
}

export const GIT_FAILURE_CASES: readonly { name: string; answer: Partial<ShellResult>; text: string }[] = [
  { name: "reports git's failure with its stderr", answer: { exitCode: 128, stderr: "fatal: not a git repository\n" }, text: "git diff failed: fatal: not a git repository" },
  { name: "reports git's failure with its exit code when it says nothing", answer: { exitCode: 2 }, text: "git diff failed: exit code 2" },
];

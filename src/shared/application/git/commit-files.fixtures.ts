// Commands, requests and stand-ins for the shared git close tests: FakeShell, FakeFiles and FakePullRequestOpener,
// no real git, no push.
import type { ShellResult } from "../ports.ts";
import type { PullRequestHandOver } from "./commit-files.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakePullRequestOpener } from "../../../../tests/support/fake-pull-request-opener.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { WORKSPACE } from "../../domain/dev/path-rebase.ts";

export const AUTHOR = "git var GIT_AUTHOR_IDENT";
export const COMMITTER = "git var GIT_COMMITTER_IDENT";
export const PROBES = ["git rev-parse -q --verify MERGE_HEAD", "git rev-parse -q --verify CHERRY_PICK_HEAD"];
export const IDENT = { stdout: "Ada <ada@example.com> 1700000000 +0100\n" };
export const SHORT_HEAD = "git rev-parse --short HEAD";
export const RM_MESSAGE = "rm -f .orkeon/ORKEON_COMMITMSG";
export const COMMIT_A_IN_WORKTREE = "git --literal-pathspecs commit -F .orkeon/ORKEON_COMMITMSG -- 'a.ts'";
export const ORIGIN_HEAD = "git symbolic-ref --short refs/remotes/origin/HEAD";
export const PUSH = "git push -u origin 'feat/x'";

/** A shell answering `results` over the empty, successful default. */
export function shellWith(results: Record<string, Partial<ShellResult>> = {}): FakeShell {
  const shell = new FakeShell();
  Object.assign(shell.results, results);
  return shell;
}

/** A commit request for one modified file, `a.ts`, with the message `m`. */
export function commitRequest(overrides: Partial<{ files: string[]; status: string; message: string }> = {}): {
  files: string[]; status: string; message: string;
} {
  return { files: ["a.ts"], status: " M a.ts", message: "m", ...overrides };
}

/** FakeFiles whose writes under the given prefixes fail, as a linked worktree's `.git` file makes them. */
export class RefusingFiles extends FakeFiles {
  readonly refused: readonly string[];
  constructor(refused: readonly string[]) { super(); this.refused = refused; }
  override async write(path: string, content: string): Promise<void> {
    if (this.refused.some((p) => path.startsWith(p))) throw new Error(`ENOTDIR: not a directory, open '${path}'`);
    return super.write(path, content);
  }
}

/** Files of a linked worktree: `.git/` cannot be written into. */
export const linkedWorktreeFiles = (): RefusingFiles => new RefusingFiles([`${WORKSPACE}/.git/`]);

/** An opener recording each pull request it opens, answering `url`. */
export function recordingOpener(url?: string): FakePullRequestOpener {
  const fake = new FakePullRequestOpener();
  if (url !== undefined) fake.url = url;
  return fake;
}

/** An opener the github tool refuses with a 401. */
export function brokenOpener(): FakePullRequestOpener {
  const fake = new FakePullRequestOpener();
  fake.failure = new Error("401");
  return fake;
}

export const REQ: PullRequestHandOver = {
  work: { folder: "workbench", vfsPath: `${WORKSPACE}/workbench` }, branch: "feat/x", base: "main", title: "fix: x",
  pushed: true, open: false, summary: { batch: "`feat/x` — fix: x", layers: [{ layer: "Changed", paths: ["a.ts"] }] },
};

export const GH = "  gh pr create --base main --head feat/x --title 'fix: x' --body-file workbench/pr-feat-x/PR.md";

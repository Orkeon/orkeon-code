// The request, the scripted git and the files the close of a dev batch is tested with.
import type { CloseBatchRequest } from "./close-batch.ts";
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export const STATUS = "git -c core.quotePath=false status --short --untracked-files=all";

/** F1 touched src/a.ts and its sheet in the work folder, on feat/a, pushed, no pull request opened. */
export const REQ: CloseBatchRequest = {
  touched: ["src/a.ts", "workbench/code/CODE-PLAN-F1.md"], message: "feat(a): add a\n\nwhy", branch: "feat/a",
  work: { folder: "workbench", vfsPath: `${WORKSPACE}/workbench` }, push: true, openPr: false,
  summary: { batch: "F1 of CODE", layers: [{ layer: "Domain", paths: ["src/a.ts"] }] }, rerun: "/dev-implement F1",
};

/** Git knowing Ada, src/a.ts, the sheet and other.ts changed, HEAD at abc1234, origin's default branch main. */
export function gitShell(): FakeShell {
  const shell = new FakeShell();
  shell.results["git var GIT_AUTHOR_IDENT"] = { stdout: "Ada <ada@example.com> 1 +0000" };
  shell.results["git var GIT_COMMITTER_IDENT"] = { stdout: "Ada <ada@example.com> 1 +0000" };
  shell.results[STATUS] = { stdout: " M src/a.ts\n?? workbench/code/CODE-PLAN-F1.md\n M other.ts\n" };
  shell.results["git rev-parse --short HEAD"] = { stdout: "abc1234\n" };
  shell.results["git symbolic-ref --short refs/remotes/origin/HEAD"] = { stdout: "origin/main\n" };
  return shell;
}

/** Files where .git is no folder, as in a linked worktree: a write under /workspace/.git/ throws ENOTDIR. */
export function linkedWorktreeFiles(): FakeFiles {
  const files = new FakeFiles();
  const write = files.write.bind(files);
  files.write = async (path: string, content: string) => {
    if (path.startsWith(`${WORKSPACE}/.git/`)) throw new Error("ENOTDIR");
    return write(path, content);
  };
  return files;
}

/** What closing REQ runs, in order: identity, status, no merge in progress, add and commit src/a.ts only, push. */
export const COMMIT_AND_PUSH_COMMANDS: readonly string[] = [
  "git var GIT_AUTHOR_IDENT", "git var GIT_COMMITTER_IDENT", STATUS,
  "git rev-parse -q --verify MERGE_HEAD", "git rev-parse -q --verify CHERRY_PICK_HEAD",
  "git --literal-pathspecs add -- 'src/a.ts'",
  "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'src/a.ts'",
  "git rev-parse --short HEAD", "git push -u origin 'feat/a'", "git symbolic-ref --short refs/remotes/origin/HEAD",
];

export const PR_COMMAND = "  gh pr create --base main --head feat/a --title 'feat(a): add a' --body-file workbench/pr-feat-a/PR.md";

export const IDENTITY_COMMANDS: readonly string[] = [
  "  git config --global user.name \"<your name>\"", "  git config --global user.email <your email>",
];

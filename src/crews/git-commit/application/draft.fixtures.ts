// The work trees, git commands and fakes the commit use case is tested over.
import { GIT_STATUS_COMMAND } from "../../../shared/domain/git/close.ts";
import type { WorkTree } from "./draft.ts";
import { MAX_COMMIT_DIFF_CHARS } from "./draft.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { WORKSPACE } from "../../../shared/domain/dev/path-rebase.ts";

export const TREE: WorkTree = { status: "M a.ts", diff: "", branch: "main", recent: "", untracked: [] };
export const MESSAGE = "fix(api): handle null\n\nbody";

/** A shell answering the four git reads of a work tree on a feature branch. */
export function treeShell(): FakeShell {
  const shell = new FakeShell();
  shell.results[GIT_STATUS_COMMAND] = { stdout: " M a.ts\n" };
  shell.results["git diff HEAD"] = { stdout: "diff --git" };
  shell.results["git branch --show-current"] = { stdout: "feature/x\n" };
  shell.results["git log --oneline -10"] = { stdout: "abc first" };
  return shell;
}

/** What inspectWorkTree reads from treeShell(). */
export const FEATURE_TREE: WorkTree = {
  status: " M a.ts\n", diff: "diff --git", branch: "feature/x", recent: "abc first", untracked: [],
};

/** A modified file, an untracked source file, and an untracked binary that cannot be read. */
export function untrackedSetup() {
  const shell = new FakeShell();
  shell.results[GIT_STATUS_COMMAND] = { stdout: " M a.ts\n?? src/new.ts\n?? img.png\n" };
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/src/new.ts`, "export const x = 1;\n");
  files.readErrors.set(`${WORKSPACE}/img.png`, new Error("binary"));
  return { shell, files };
}

/** A status with two new files, a scope selecting a modified file and one of them. */
export function scopedSetup() {
  const shell = new FakeShell();
  shell.results["git --literal-pathspecs diff HEAD -- 'a.ts' 'src/new.ts'"] = { stdout: "diff a" };
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/src/new.ts`, "x\n");
  files.files.set(`${WORKSPACE}/workbench/p.md`, "plan\n");
  const scope = { status: " M a.ts\n?? src/new.ts\n?? workbench/p.md\n", files: ["a.ts", "src/new.ts"] };
  return { shell, files, scope };
}

export const SEL = { files: ["a.ts"], status: " M a.ts\n" };
export const ADD = "git --literal-pathspecs add -- 'a.ts'";
export const COMMIT = "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'a.ts'";
export const PROBES = ["git rev-parse -q --verify MERGE_HEAD", "git rev-parse -q --verify CHERRY_PICK_HEAD"];

/** Files whose `.git/` is no folder (a linked worktree): a write under it throws ENOTDIR. */
export function linkedWorktreeFiles(): FakeFiles {
  const files = new FakeFiles();
  const write = files.write.bind(files);
  files.write = async (path: string, content: string) => {
    if (path.startsWith(`${WORKSPACE}/.git/`)) throw new Error("ENOTDIR");
    return write(path, content);
  };
  return files;
}

/** A tree with a modified and a new file, its diff 5 characters past the cap. */
export const LONG_TREE: WorkTree = {
  status: " M src/a.ts\n?? src/b.ts\n", diff: "d".repeat(MAX_COMMIT_DIFF_CHARS + 5), branch: "main",
  recent: "abc1234 feat(cli): add flags\n", untracked: [{ path: "src/b.ts", content: "export {};\n" }],
};

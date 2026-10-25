// The shared git close over FakeShell and FakeFiles: no real git, no push. Run:
//   node --test src/shared/application/git/commit-files.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { commitFiles, defaultBranch, handOverPullRequest, pushBranch, readIdentity } from "./commit-files.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import {
  AUTHOR, brokenOpener, COMMITTER, COMMIT_A_IN_WORKTREE, GH, IDENT, ORIGIN_HEAD, PROBES, PUSH, REQ, RM_MESSAGE, recordingOpener,
  RefusingFiles, SHORT_HEAD, commitRequest, linkedWorktreeFiles, shellWith,
} from "./commit-files.fixtures.ts";

describe("readIdentity", () => {
  it("reads git's author identity once the committer's is there too", async () => {
    // Arrange
    const shell = shellWith({ [AUTHOR]: IDENT, [COMMITTER]: IDENT });

    // Act
    const out = await readIdentity(shell);

    // Assert
    deepStrictEqual(out, { ok: true, ident: { name: "Ada", email: "ada@example.com" } });
    deepStrictEqual(shell.commands, [AUTHOR, COMMITTER]);
  });

  it("is not ok with git's line when git has no identity, and never asks the committer then", async () => {
    // Arrange
    const shell = shellWith({ [AUTHOR]: { exitCode: 128, stderr: "fatal: unable to auto-detect email address (got 'u@box.(none)')\n" } });

    // Act
    const out = await readIdentity(shell);

    // Assert
    deepStrictEqual(out, { ok: false, detail: "fatal: unable to auto-detect email address (got 'u@box.(none)')" });
    deepStrictEqual(shell.commands, [AUTHOR]);
  });

  it("is not ok when only the author is set", async () => {
    // Arrange
    const shell = shellWith({ [AUTHOR]: IDENT, [COMMITTER]: { exitCode: 128, stderr: "fatal: empty ident name not allowed" } });

    // Act
    const out = await readIdentity(shell);

    // Assert
    strictEqual(out.ok, false);
  });

  it("is not ok when the runtime refuses the check", async () => {
    // Arrange
    const shell = new FakeShell();
    shell.errors[AUTHOR] = new Error("command not allowed: git var");

    // Act
    const out = await readIdentity(shell);

    // Assert
    deepStrictEqual(out, { ok: false, detail: "refused by the runtime: command not allowed: git var" });
  });
});

describe("commitFiles", () => {
  it("adds and commits the listed files only, the message through a file, and reads the hash", async () => {
    // Arrange
    const shell = shellWith({ [SHORT_HEAD]: { stdout: "abc1234\n" } });
    const files = new FakeFiles();
    const request = { files: ["src/a.ts", "a b.md"], status: " M src/a.ts\n?? a b.md\n", message: "fix: x" };

    // Act
    const out = await commitFiles({ shell, files }, request);

    // Assert
    deepStrictEqual(out, { ok: true, hash: "abc1234" });
    deepStrictEqual(shell.commands, [
      ...PROBES,
      "git --literal-pathspecs add -- 'src/a.ts' 'a b.md'",
      "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'src/a.ts' 'a b.md'",
      SHORT_HEAD,
    ]);
    deepStrictEqual(files.writes, [{ path: "/workspace/.git/ORKEON_COMMITMSG", content: "fix: x" }]);
  });

  it("leaves a staged deletion and the old side of a staged rename out of `git add`, not out of the commit", async () => {
    // Arrange
    const shell = shellWith();
    const request = commitRequest({
      files: ["gone.ts", "old.ts", "new.ts", "unstaged.ts"], status: "D  gone.ts\nR  old.ts -> new.ts\n D unstaged.ts\n",
    });

    // Act
    await commitFiles({ shell, files: new FakeFiles() }, request);

    // Assert
    deepStrictEqual(shell.commands.slice(2, 4), [
      "git --literal-pathspecs add -- 'new.ts' 'unstaged.ts'",
      "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'gone.ts' 'old.ts' 'new.ts' 'unstaged.ts'",
    ]);
  });

  it("commits a lone staged deletion with no `git add` before it", async () => {
    // Arrange
    const shell = shellWith();
    const request = commitRequest({ files: ["gone.ts"], status: "D  gone.ts\n" });

    // Act
    await commitFiles({ shell, files: new FakeFiles() }, request);

    // Assert
    strictEqual(shell.commands[2], "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'gone.ts'");
  });

  it("says there is nothing to commit when no file is listed", async () => {
    // Arrange
    const request = commitRequest({ files: [], status: "" });

    // Act
    const out = await commitFiles({ shell: shellWith(), files: new FakeFiles() }, request);

    // Assert
    deepStrictEqual(out, { ok: false, line: "nothing to commit" });
  });

  it("refuses a path the shell cannot carry, running nothing", async () => {
    // Arrange
    const shell = shellWith();
    const request = commitRequest({ files: ["it's.ts"], status: "?? it's.ts" });

    // Act
    const out = await commitFiles({ shell, files: new FakeFiles() }, request);

    // Assert
    deepStrictEqual(out, { ok: false, line: "cannot go through the shell: it's.ts" });
    deepStrictEqual(shell.commands, []);
  });

  it("says git's line when `git add` fails, and runs nothing after it", async () => {
    // Arrange
    const shell = shellWith({ "git --literal-pathspecs add -- 'a.ts'": { exitCode: 128, stderr: "fatal: pathspec 'a.ts' did not match any files\n" } });
    const files = new FakeFiles();

    // Act
    const out = await commitFiles({ shell, files }, commitRequest());

    // Assert
    deepStrictEqual(out, { ok: false, line: "git add failed: fatal: pathspec 'a.ts' did not match any files" });
    // The message is written first, so a failed write never leaves files staged.
    deepStrictEqual([shell.commands.length, files.writes.length], [3, 1]);
  });

  it("refuses while a merge or a cherry-pick is in progress", async () => {
    // Arrange
    const shell = shellWith({ [PROBES[0]]: { stdout: "4b825dc642cb6eb9a060e54bf8d69288fbee4904\n" } });

    // Act
    const out = await commitFiles({ shell, files: new FakeFiles() }, commitRequest());

    // Assert
    deepStrictEqual(out, { ok: false, line: "a merge or a cherry-pick is in progress: conclude it with git commit in a terminal" });
    deepStrictEqual(shell.commands, [PROBES[0]]);
  });

  it("says git's line when `git commit` fails", async () => {
    // Arrange
    const shell = shellWith({
      "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'a.ts'": { exitCode: 1, stdout: "nothing added to commit\n" },
    });

    // Act
    const out = await commitFiles({ shell, files: new FakeFiles() }, commitRequest());

    // Assert
    deepStrictEqual(out, { ok: false, line: "git commit failed: nothing added to commit" });
  });
});

describe("commitFiles in a linked worktree (.git is a file)", () => {
  it("writes the message under .orkeon/, commits with it, then removes it", async () => {
    // Arrange
    const shell = shellWith({ [SHORT_HEAD]: { stdout: "abc1234\n" } });
    const files = linkedWorktreeFiles();

    // Act
    const out = await commitFiles({ shell, files }, commitRequest({ message: "fix: x" }));

    // Assert
    deepStrictEqual(out, { ok: true, hash: "abc1234" });
    deepStrictEqual(files.writes, [{ path: "/workspace/.orkeon/ORKEON_COMMITMSG", content: "fix: x" }]);
    deepStrictEqual(shell.commands.slice(2), [
      "git --literal-pathspecs add -- 'a.ts'",
      COMMIT_A_IN_WORKTREE,
      RM_MESSAGE,
      SHORT_HEAD,
    ]);
  });

  it("says the message file it could not remove after a commit that landed", async () => {
    // Arrange
    const shell = shellWith({
      [SHORT_HEAD]: { stdout: "abc1234\n" },
      [RM_MESSAGE]: { stderr: "rm: cannot remove '.orkeon/ORKEON_COMMITMSG': Permission denied\n", exitCode: 1 },
    });

    // Act
    const out = await commitFiles({ shell, files: linkedWorktreeFiles() }, commitRequest({ message: "fix: x" }));

    // Assert
    deepStrictEqual(out, {
      ok: true, hash: "abc1234",
      note: ".orkeon/ORKEON_COMMITMSG could not be removed (rm: cannot remove '.orkeon/ORKEON_COMMITMSG': Permission denied): remove it by hand",
    });
  });

  it("says the message file it could not remove after a commit that failed", async () => {
    // Arrange
    const shell = shellWith({ [COMMIT_A_IN_WORKTREE]: { stderr: "fatal: x\n", exitCode: 128 } });
    shell.errors[RM_MESSAGE] = new Error("refused");

    // Act
    const out = await commitFiles({ shell, files: linkedWorktreeFiles() }, commitRequest({ message: "fix: x" }));

    // Assert
    deepStrictEqual(out, {
      ok: false,
      line: "git commit failed: fatal: x; .orkeon/ORKEON_COMMITMSG could not be removed (refused by the runtime: refused): remove it by hand",
    });
  });

  it("says so, and stages nothing, when no message file can be written", async () => {
    // Arrange
    const shell = shellWith();
    const files = new RefusingFiles(["/workspace/.git/", "/workspace/.orkeon/"]);

    // Act
    const out = await commitFiles({ shell, files }, commitRequest());

    // Assert
    deepStrictEqual(out, {
      ok: false,
      line: "the commit message could not be written (.git/ORKEON_COMMITMSG, .orkeon/ORKEON_COMMITMSG): ENOTDIR: not a directory, open '/workspace/.orkeon/ORKEON_COMMITMSG'",
    });
    deepStrictEqual(shell.commands, PROBES);
  });
});

describe("pushBranch", () => {
  it("pushes with its upstream", async () => {
    // Arrange
    const shell = shellWith();

    // Act
    const out = await pushBranch(shell, "feat/x");

    // Assert
    deepStrictEqual(out, { ok: true });
    deepStrictEqual(shell.commands, [PUSH]);
  });

  it("says git's line when the push is refused", async () => {
    // Arrange
    const shell = shellWith({ [PUSH]: { exitCode: 128, stderr: "fatal: 'origin' does not appear to be a git repository\n" } });

    // Act
    const out = await pushBranch(shell, "feat/x");

    // Assert
    deepStrictEqual(out, { ok: false, line: "push refused, the commit stays local: fatal: 'origin' does not appear to be a git repository" });
  });

  it("runs nothing on a detached HEAD", async () => {
    // Arrange
    const shell = shellWith();

    // Act
    const out = await pushBranch(shell, "");

    // Assert
    deepStrictEqual(out, { ok: false, line: "not pushed: no branch is checked out (detached HEAD)" });
    deepStrictEqual(shell.commands, []);
  });
});

describe("defaultBranch", () => {
  it("reads origin/HEAD", async () => {
    // Arrange
    const shell = shellWith({ [ORIGIN_HEAD]: { stdout: "origin/main\n" } });

    // Act
    const branch = await defaultBranch(shell);

    // Assert
    strictEqual(branch, "main");
  });

  it("is null when origin/HEAD is unset", async () => {
    // Arrange
    const shell = shellWith({ [ORIGIN_HEAD]: { exitCode: 128, stderr: "fatal: ref not a symbolic ref" } });

    // Act
    const branch = await defaultBranch(shell);

    // Assert
    strictEqual(branch, null);
  });
});

describe("handOverPullRequest", () => {
  it("writes the body under <work>/pr-<slug>/PR.md and prints the command", async () => {
    // Arrange
    const files = new FakeFiles();

    // Act
    const lines = await handOverPullRequest({ files }, REQ);

    // Assert
    deepStrictEqual(lines, ["pull request body: workbench/pr-feat-x/PR.md", "to open the pull request, in a terminal:", GH]);
    strictEqual(files.writes[0].path, "/workspace/workbench/pr-feat-x/PR.md");
    ok(files.writes[0].content.startsWith("## Batch\n"), files.writes[0].content);
  });

  it("puts the push before the command when the branch was not pushed", async () => {
    // Arrange
    const request = { ...REQ, pushed: false };

    // Act
    const lines = await handOverPullRequest({ files: new FakeFiles() }, request);

    // Assert
    deepStrictEqual(lines.slice(2), ["  git push -u origin 'feat/x'", GH]);
  });

  it("asked to open it without an opener (no github tool): the command printed, and said so", async () => {
    // Arrange
    const request = { ...REQ, open: true };

    // Act
    const lines = await handOverPullRequest({ files: new FakeFiles() }, request);

    // Assert
    deepStrictEqual(lines.slice(-2), [
      GH, "the pull request is opened here only through the github tool, which this host does not offer: run the command above",
    ]);
  });

  it("opens it through the seam when one is given", async () => {
    // Arrange
    const opener = recordingOpener();

    // Act
    const lines = await handOverPullRequest({ files: new FakeFiles(), opener }, { ...REQ, open: true });

    // Assert
    deepStrictEqual(lines.slice(-1), ["✓ pull request opened: https://example.com/pr/1"]);
    deepStrictEqual(opener.opened.map((pr) => ({ ...pr, body: pr.body.split("\n")[0] })), [
      { base: "main", head: "feat/x", title: "fix: x", bodyFile: "workbench/pr-feat-x/PR.md", body: "## Batch" },
    ]);
  });

  it("falls back to the command when the opener fails", async () => {
    // Arrange
    const deps = { files: new FakeFiles(), opener: brokenOpener() };

    // Act
    const lines = await handOverPullRequest(deps, { ...REQ, open: true });

    // Assert
    deepStrictEqual(lines.slice(1), ["✗ the pull request was not opened: 401", "to open the pull request, in a terminal:", GH]);
  });

  it("does not open it before the push, even with an opener", async () => {
    // Arrange
    const opener = recordingOpener("u");

    // Act
    const lines = await handOverPullRequest({ files: new FakeFiles(), opener }, { ...REQ, open: true, pushed: false });

    // Assert
    deepStrictEqual([opener.opened.length, lines.slice(-1)], [0, [GH]]);
  });

  it("says the body could not be written when its write fails, and still hands the command over", async () => {
    // Arrange
    const files = new RefusingFiles(["/workspace/workbench/"]);

    // Act
    const lines = await handOverPullRequest({ files }, REQ);

    // Assert
    deepStrictEqual(lines, [
      "⚠ the body could not be written (ENOTDIR: not a directory, open '/workspace/workbench/pr-feat-x/PR.md'): write workbench/pr-feat-x/PR.md first",
      "to open the pull request, in a terminal:", GH,
    ]);
  });

  it("says the body could not be written when the work folder lies outside the mounts", async () => {
    // Arrange
    const files = new FakeFiles();
    const request = { ...REQ, work: { folder: "/home/main/workbench", vfsPath: null } };

    // Act
    const lines = await handOverPullRequest({ files }, request);

    // Assert
    strictEqual(files.writes.length, 0);
    ok(lines[0].includes("/home/main/workbench/pr-feat-x/PR.md"), lines[0]);
  });
});

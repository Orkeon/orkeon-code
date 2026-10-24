// The shared git close over FakeShell and FakeFiles: no real git, no push. Run:
//   node --test src/shared/application/git/commit-files.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { commitFiles, defaultBranch, handOverPullRequest, pushBranch, readIdentity } from "./commit-files.ts";
import type { PullRequestHandOver } from "./commit-files.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const AUTHOR = "git var GIT_AUTHOR_IDENT";
const COMMITTER = "git var GIT_COMMITTER_IDENT";
const PROBES = ["git rev-parse -q --verify MERGE_HEAD", "git rev-parse -q --verify CHERRY_PICK_HEAD"];
const IDENT = { stdout: "Ada <ada@example.com> 1700000000 +0100\n" };

describe("readIdentity", () => {
  it("reads git's author identity once the committer's is there too", async () => {
    const shell = new FakeShell();
    shell.results[AUTHOR] = IDENT;
    shell.results[COMMITTER] = IDENT;
    deepStrictEqual(await readIdentity(shell), { ok: true, ident: { name: "Ada", email: "ada@example.com" } });
    deepStrictEqual(shell.commands, [AUTHOR, COMMITTER]);
  });

  it("is not ok with git's line when git has no identity, and never asks the committer then", async () => {
    const shell = new FakeShell();
    shell.results[AUTHOR] = { exitCode: 128, stderr: "fatal: unable to auto-detect email address (got 'u@box.(none)')\n" };
    deepStrictEqual(await readIdentity(shell), { ok: false, detail: "fatal: unable to auto-detect email address (got 'u@box.(none)')" });
    deepStrictEqual(shell.commands, [AUTHOR]);
  });

  it("is not ok when only the author is set, or when the runtime refuses the check", async () => {
    const shell = new FakeShell();
    shell.results[AUTHOR] = IDENT;
    shell.results[COMMITTER] = { exitCode: 128, stderr: "fatal: empty ident name not allowed" };
    strictEqual((await readIdentity(shell)).ok, false);
    const refusing = new FakeShell();
    refusing.errors[AUTHOR] = new Error("command not allowed: git var");
    deepStrictEqual(await readIdentity(refusing), { ok: false, detail: "refused by the runtime: command not allowed: git var" });
  });
});

describe("commitFiles", () => {
  it("adds and commits the listed files only, the message through a file, and reads the hash", async () => {
    const shell = new FakeShell();
    shell.results["git rev-parse --short HEAD"] = { stdout: "abc1234\n" };
    const files = new FakeFiles();
    const out = await commitFiles({ shell, files }, { files: ["src/a.ts", "a b.md"], status: " M src/a.ts\n?? a b.md\n", message: "fix: x" });
    deepStrictEqual(out, { ok: true, hash: "abc1234" });
    deepStrictEqual(shell.commands, [
      ...PROBES,
      "git --literal-pathspecs add -- 'src/a.ts' 'a b.md'",
      "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'src/a.ts' 'a b.md'",
      "git rev-parse --short HEAD",
    ]);
    deepStrictEqual(files.writes, [{ path: "/workspace/.git/ORKEON_COMMITMSG", content: "fix: x" }]);
  });

  it("leaves a staged deletion and the old side of a staged rename out of `git add`, not out of the commit", async () => {
    const shell = new FakeShell();
    const status = "D  gone.ts\nR  old.ts -> new.ts\n D unstaged.ts\n";
    await commitFiles({ shell, files: new FakeFiles() }, { files: ["gone.ts", "old.ts", "new.ts", "unstaged.ts"], status, message: "m" });
    deepStrictEqual(shell.commands.slice(2, 4), [
      "git --literal-pathspecs add -- 'new.ts' 'unstaged.ts'",
      "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'gone.ts' 'old.ts' 'new.ts' 'unstaged.ts'",
    ]);
    const onlyGone = new FakeShell();
    await commitFiles({ shell: onlyGone, files: new FakeFiles() }, { files: ["gone.ts"], status: "D  gone.ts\n", message: "m" });
    strictEqual(onlyGone.commands[2], "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'gone.ts'");
  });

  it("says why when there is nothing, a path the shell cannot carry, or git fails; nothing runs after a failure", async () => {
    deepStrictEqual(await commitFiles({ shell: new FakeShell(), files: new FakeFiles() }, { files: [], status: "", message: "m" }), {
      ok: false, line: "nothing to commit",
    });
    const quoteShell = new FakeShell();
    deepStrictEqual(await commitFiles({ shell: quoteShell, files: new FakeFiles() }, { files: ["it's.ts"], status: "?? it's.ts", message: "m" }), {
      ok: false, line: "cannot go through the shell: it's.ts",
    });
    deepStrictEqual(quoteShell.commands, []);
    const shell = new FakeShell();
    shell.results["git --literal-pathspecs add -- 'a.ts'"] = { exitCode: 128, stderr: "fatal: pathspec 'a.ts' did not match any files\n" };
    const files = new FakeFiles();
    deepStrictEqual(await commitFiles({ shell, files }, { files: ["a.ts"], status: " M a.ts", message: "m" }), {
      ok: false, line: "git add failed: fatal: pathspec 'a.ts' did not match any files",
    });
    deepStrictEqual([shell.commands.length, files.writes.length], [3, 0]);
    const merging = new FakeShell();
    merging.results[PROBES[0]] = { stdout: "4b825dc642cb6eb9a060e54bf8d69288fbee4904\n" };
    deepStrictEqual(await commitFiles({ shell: merging, files: new FakeFiles() }, { files: ["a.ts"], status: " M a.ts", message: "m" }), {
      ok: false, line: "a merge or a cherry-pick is in progress: conclude it with git commit in a terminal",
    });
    deepStrictEqual(merging.commands, [PROBES[0]]);
    const failing = new FakeShell();
    failing.results["git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'a.ts'"] = { exitCode: 1, stdout: "nothing added to commit\n" };
    deepStrictEqual(await commitFiles({ shell: failing, files: new FakeFiles() }, { files: ["a.ts"], status: " M a.ts", message: "m" }), {
      ok: false, line: "git commit failed: nothing added to commit",
    });
  });
});

describe("pushBranch", () => {
  it("pushes with its upstream, and says git's line when refused", async () => {
    const shell = new FakeShell();
    deepStrictEqual(await pushBranch(shell, "feat/x"), { ok: true });
    deepStrictEqual(shell.commands, ["git push -u origin 'feat/x'"]);
    const refused = new FakeShell();
    refused.results["git push -u origin 'feat/x'"] = { exitCode: 128, stderr: "fatal: 'origin' does not appear to be a git repository\n" };
    deepStrictEqual(await pushBranch(refused, "feat/x"), {
      ok: false, line: "push refused, the commit stays local: fatal: 'origin' does not appear to be a git repository",
    });
  });

  it("runs nothing on a detached HEAD", async () => {
    const shell = new FakeShell();
    deepStrictEqual(await pushBranch(shell, ""), { ok: false, line: "not pushed: no branch is checked out (detached HEAD)" });
    deepStrictEqual(shell.commands, []);
  });
});

describe("defaultBranch", () => {
  it("reads origin/HEAD, null when unset", async () => {
    const shell = new FakeShell();
    shell.results["git symbolic-ref --short refs/remotes/origin/HEAD"] = { stdout: "origin/main\n" };
    strictEqual(await defaultBranch(shell), "main");
    const unset = new FakeShell();
    unset.results["git symbolic-ref --short refs/remotes/origin/HEAD"] = { exitCode: 128, stderr: "fatal: ref not a symbolic ref" };
    strictEqual(await defaultBranch(unset), null);
  });
});

describe("handOverPullRequest", () => {
  const REQ: PullRequestHandOver = {
    work: { folder: "workbench", vfsPath: "/workspace/workbench" }, branch: "feat/x", base: "main", title: "fix: x",
    pushed: true, open: false, summary: { batch: "`feat/x` — fix: x", layers: [{ layer: "Changed", paths: ["a.ts"] }] },
  };
  const GH = "  gh pr create --base main --head feat/x --title 'fix: x' --body-file workbench/pr-feat-x/PR.md";

  it("writes the body under <work>/pr-<slug>/PR.md and prints the command", async () => {
    const files = new FakeFiles();
    deepStrictEqual(await handOverPullRequest({ files }, REQ), [
      "pull request body: workbench/pr-feat-x/PR.md", "to open the pull request, in a terminal:", GH,
    ]);
    strictEqual(files.writes[0].path, "/workspace/workbench/pr-feat-x/PR.md");
    ok(files.writes[0].content.startsWith("## Batch\n"));
  });

  it("puts the push before the command when the branch was not pushed", async () => {
    const lines = await handOverPullRequest({ files: new FakeFiles() }, { ...REQ, pushed: false });
    deepStrictEqual(lines.slice(2), ["  git push -u origin 'feat/x'", GH]);
  });

  it("asked to open it without an opener (no github tool): the command printed, and said so", async () => {
    const lines = await handOverPullRequest({ files: new FakeFiles() }, { ...REQ, open: true });
    deepStrictEqual(lines.slice(-2), [
      GH, "the pull request is opened here only through the github tool, which this host does not offer: run the command above",
    ]);
  });

  it("opens it through the seam when one is given, and falls back to the command when it fails", async () => {
    const opened: unknown[] = [];
    const opener = { open: async (pr: unknown) => { opened.push(pr); return { url: "https://example.com/pr/1" }; } };
    deepStrictEqual((await handOverPullRequest({ files: new FakeFiles(), opener }, { ...REQ, open: true })).slice(-1), [
      "✓ pull request opened: https://example.com/pr/1",
    ]);
    deepStrictEqual(opened.map((pr: any) => ({ ...pr, body: pr.body.split("\n")[0] })), [
      { base: "main", head: "feat/x", title: "fix: x", bodyFile: "workbench/pr-feat-x/PR.md", body: "## Batch" },
    ]);
    const broken = { open: async () => { throw new Error("401"); } };
    const lines = await handOverPullRequest({ files: new FakeFiles(), opener: broken }, { ...REQ, open: true });
    deepStrictEqual(lines.slice(1), ["✗ the pull request was not opened: 401", "to open the pull request, in a terminal:", GH]);
  });

  it("does not open it before the push, even with an opener", async () => {
    const opened: unknown[] = [];
    const opener = { open: async (pr: unknown) => { opened.push(pr); return { url: "u" }; } };
    const lines = await handOverPullRequest({ files: new FakeFiles(), opener }, { ...REQ, open: true, pushed: false });
    deepStrictEqual([opened.length, lines.slice(-1)], [0, [GH]]);
  });

  it("says the body could not be written when the work folder lies outside the mounts", async () => {
    const files = new FakeFiles();
    const lines = await handOverPullRequest({ files }, { ...REQ, work: { folder: "/home/main/workbench", vfsPath: null } });
    strictEqual(files.writes.length, 0);
    ok(lines[0].includes("/home/main/workbench/pr-feat-x/PR.md"));
  });
});

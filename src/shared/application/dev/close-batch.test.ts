// The close of a dev batch over FakeShell and FakeFiles: no real git, no push. Run:
//   node --test src/shared/application/dev/close-batch.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { closeBatch } from "./close-batch.ts";
import { parseSessionRules } from "../../domain/git/pull-request.ts";
import type { CloseBatchRequest } from "./close-batch.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const STATUS = "git -c core.quotePath=false status --short --untracked-files=all";
const REQ: CloseBatchRequest = {
  touched: ["src/a.ts", "workbench/code/CODE-PLAN-F1.md"], message: "feat(a): add a\n\nwhy", branch: "feat/a",
  work: { folder: "workbench", vfsPath: "/workspace/workbench" }, push: true, openPr: false,
  summary: { batch: "F1 of CODE", layers: [{ layer: "Domain", paths: ["src/a.ts"] }] }, rerun: "/dev-implement F1",
};

function gitShell(): FakeShell {
  const shell = new FakeShell();
  shell.results["git var GIT_AUTHOR_IDENT"] = { stdout: "Ada <ada@example.com> 1 +0000" };
  shell.results["git var GIT_COMMITTER_IDENT"] = { stdout: "Ada <ada@example.com> 1 +0000" };
  shell.results[STATUS] = { stdout: " M src/a.ts\n?? workbench/code/CODE-PLAN-F1.md\n M other.ts\n" };
  shell.results["git rev-parse --short HEAD"] = { stdout: "abc1234\n" };
  shell.results["git symbolic-ref --short refs/remotes/origin/HEAD"] = { stdout: "origin/main\n" };
  return shell;
}

describe("closeBatch", () => {
  it("commits the touched files only, never the work folder, pushes, and prints the PR command", async () => {
    const shell = gitShell();
    const files = new FakeFiles();
    const out = await closeBatch({ shell, files }, REQ);
    strictEqual(out.committed, true);
    deepStrictEqual(shell.commands, [
      "git var GIT_AUTHOR_IDENT", "git var GIT_COMMITTER_IDENT", STATUS,
      "git rev-parse -q --verify MERGE_HEAD", "git rev-parse -q --verify CHERRY_PICK_HEAD",
      "git --literal-pathspecs add -- 'src/a.ts'",
      "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'src/a.ts'",
      "git rev-parse --short HEAD", "git push -u origin 'feat/a'", "git symbolic-ref --short refs/remotes/origin/HEAD",
    ]);
    ok(out.lines[0].includes("workbench/code/CODE-PLAN-F1.md"));
    ok(out.lines.includes("  gh pr create --base main --head feat/a --title 'feat(a): add a' --body-file workbench/pr-feat-a/PR.md"));
    strictEqual(files.writes.at(-1)!.path, "/workspace/workbench/pr-feat-a/PR.md");
  });

  it("with no identity commits nothing and hands over the two commands", async () => {
    const shell = gitShell();
    shell.results["git var GIT_AUTHOR_IDENT"] = { exitCode: 128, stderr: "fatal: unable to auto-detect email address" };
    const out = await closeBatch({ shell, files: new FakeFiles() }, REQ);
    strictEqual(out.committed, false);
    deepStrictEqual(shell.commands, ["git var GIT_AUTHOR_IDENT"]);
    deepStrictEqual(out.lines[0].split("\n").slice(1), [
      "  git config --global user.name \"<your name>\"", "  git config --global user.email <your email>",
    ]);
  });

  it("in a batch worktree commits without pushing and without a pull request", async () => {
    const shell = gitShell();
    const out = await closeBatch({ shell, files: new FakeFiles() }, { ...REQ, push: false });
    deepStrictEqual([out.committed, shell.commands.includes("git push -u origin 'feat/a'"), out.lines.some((l) => l.includes("gh pr"))], [true, false, false]);
  });

  it("on the default branch pushes and prints no pull request", async () => {
    const shell = gitShell();
    const out = await closeBatch({ shell, files: new FakeFiles() }, { ...REQ, branch: "main" });
    strictEqual(out.lines.some((l) => l.includes("gh pr")), false);
  });

  it("a session rule denying the push keeps the commit local and pushes nothing", async () => {
    const shell = gitShell();
    const out = await closeBatch({ shell, files: new FakeFiles() }, { ...REQ, rules: parseSessionRules(["deny shell_command command=git push*"]) });
    strictEqual(out.committed, true);
    strictEqual(shell.commands.some((c) => c.startsWith("git push")), false);
    ok(out.lines.includes("✗ not pushed: a session rule denies 'git push -u origin 'feat/a''; the commit stays local"), out.lines.join("\n"));
  });

  it("a refused push keeps the commit and hands the push over with the PR command", async () => {
    const shell = gitShell();
    shell.results["git push -u origin 'feat/a'"] = { exitCode: 128, stderr: "fatal: no remote\n" };
    const out = await closeBatch({ shell, files: new FakeFiles() }, REQ);
    ok(out.lines.includes("✗ push refused, the commit stays local: fatal: no remote"));
    ok(out.lines.includes("  git push -u origin 'feat/a'"));
  });

  it("nothing touched has changed: no commit", async () => {
    const shell = gitShell();
    const out = await closeBatch({ shell, files: new FakeFiles() }, { ...REQ, touched: ["src/b.ts"] });
    deepStrictEqual([out.committed, out.lines.at(-1)], [false, "✗ nothing to commit"]);
  });
});

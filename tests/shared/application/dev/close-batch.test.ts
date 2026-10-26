// The close of a dev batch over FakeShell and FakeFiles: no real git, no push. Run:
//   node --test tests/shared/application/dev/close-batch.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { closeBatch } from "../../../../src/shared/application/dev/close-batch.ts";
import { parseSessionRules } from "../../../../src/shared/domain/git/pull-request.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import {
  COMMIT_AND_PUSH_COMMANDS, gitShell, IDENTITY_COMMANDS, PR_COMMAND, REQ,
} from "./close-batch.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { linkedWorktreeFiles } from "../../../support/fixtures/linked-worktree-files.ts";

describe("closeBatch", () => {
  it("commits the touched files only, never the work folder, pushes, and prints the PR command", async () => {
    // Arrange
    const shell = gitShell();
    const files = new FakeFiles();

    // Act
    const out = await closeBatch({ shell, files }, REQ);

    // Assert
    strictEqual(out.committed, true);
    deepStrictEqual(shell.commands, COMMIT_AND_PUSH_COMMANDS);
    ok(out.lines[0].includes("workbench/code/CODE-PLAN-F1.md"), out.lines[0]);
    ok(out.lines.includes(PR_COMMAND), out.lines.join("\n"));
    strictEqual(files.writes.at(-1)!.path, `${WORKSPACE}/workbench/pr-feat-a/PR.md`);
  });

  it("says the message file it could not remove in a linked worktree, after the commit line", async () => {
    // Arrange
    const shell = gitShell();
    shell.results["rm -f .orkeon/ORKEON_COMMITMSG"] = { exitCode: 1, stderr: "rm: denied" };
    const files = linkedWorktreeFiles();

    // Act
    const out = await closeBatch({ shell, files }, { ...REQ, push: false });

    // Assert
    strictEqual(out.committed, true);
    const at = out.lines.findIndex((l) => l.startsWith("✓ committed abc1234"));
    strictEqual(out.lines[at + 1], "⚠ .orkeon/ORKEON_COMMITMSG could not be removed (rm: denied): remove it by hand");
  });

  it("with no identity commits nothing and hands over the two commands", async () => {
    // Arrange
    const shell = gitShell();
    shell.results["git var GIT_AUTHOR_IDENT"] = { exitCode: 128, stderr: "fatal: unable to auto-detect email address" };

    // Act
    const out = await closeBatch({ shell, files: new FakeFiles() }, REQ);

    // Assert
    strictEqual(out.committed, false);
    deepStrictEqual(shell.commands, ["git var GIT_AUTHOR_IDENT"]);
    deepStrictEqual(out.lines[0].split("\n").slice(1), IDENTITY_COMMANDS);
  });

  it("in a batch worktree commits without pushing and without a pull request", async () => {
    // Arrange
    const shell = gitShell();

    // Act
    const out = await closeBatch({ shell, files: new FakeFiles() }, { ...REQ, push: false });

    // Assert
    deepStrictEqual([out.committed, shell.commands.includes("git push -u origin 'feat/a'"), out.lines.some((l) => l.includes("gh pr"))], [true, false, false]);
  });

  it("on the default branch pushes and prints no pull request", async () => {
    // Arrange
    const shell = gitShell();

    // Act
    const out = await closeBatch({ shell, files: new FakeFiles() }, { ...REQ, branch: "main" });

    // Assert
    strictEqual(out.lines.some((l) => l.includes("gh pr")), false);
  });

  it("a session rule denying the push keeps the commit local and pushes nothing", async () => {
    // Arrange
    const shell = gitShell();
    const rules = parseSessionRules(["deny shell_command command=git push*"]);

    // Act
    const out = await closeBatch({ shell, files: new FakeFiles() }, { ...REQ, rules });

    // Assert
    strictEqual(out.committed, true);
    strictEqual(shell.commands.some((c) => c.startsWith("git push")), false);
    ok(out.lines.includes("✗ not pushed: a session rule denies 'git push -u origin 'feat/a''; the commit stays local"), out.lines.join("\n"));
  });

  it("a refused push keeps the commit and hands the push over with the PR command", async () => {
    // Arrange
    const shell = gitShell();
    shell.results["git push -u origin 'feat/a'"] = { exitCode: 128, stderr: "fatal: no remote\n" };

    // Act
    const out = await closeBatch({ shell, files: new FakeFiles() }, REQ);

    // Assert
    ok(out.lines.includes("✗ push refused, the commit stays local: fatal: no remote"), out.lines.join("\n"));
    ok(out.lines.includes("  git push -u origin 'feat/a'"), out.lines.join("\n"));
  });

  it("nothing touched has changed: no commit", async () => {
    // Arrange
    const shell = gitShell();

    // Act
    const out = await closeBatch({ shell, files: new FakeFiles() }, { ...REQ, touched: ["src/b.ts"] });

    // Assert
    deepStrictEqual([out.committed, out.lines.at(-1)], [false, "✗ nothing to commit"]);
  });
});

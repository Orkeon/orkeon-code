// The /commit use case over FakeShell, FakeFiles, FakeLlm, FakeCrewMemory, FakeLogger and
// FakePullRequestOpener. Run: node --test tests/crews/git-commit/application/run-git-commit.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { runGitCommit } from "../../../../src/crews/git-commit/application/run-git-commit.ts";
import { GIT_STATUS_COMMAND } from "../../../../src/shared/domain/git/close.ts";
import { CLEAN, MESSAGE, PR_WITH_TOOL, PUSH, commitInput, world } from "./run-git-commit.fixtures.ts";
import { assertCommitted, assertNotCommitted, assertStoppedBeforeDraft } from "./run-git-commit.assertions.ts";
import { assertMentions, assertOmits } from "../../../support/assertions/text.ts";

describe("runGitCommit: the stops before the commit", () => {
  it("refuses a read-only mode before any git call", async () => {
    // Arrange
    const w = world();

    // Act
    await runGitCommit(commitInput({ permissionMode: "plan" }), w.deps);

    // Assert
    deepStrictEqual(w.shell.commands, []);
  });

  it("says the refusal of a read-only mode in its answer and in the log", async () => {
    // Arrange
    const w = world();

    // Act
    const answer = await runGitCommit(commitInput({ permissionMode: "plan" }), w.deps);

    // Assert
    assertMentions([answer, ...w.log.lines].join("\n"), ["✗ refused: ", "warn: git-commit refused: "]);
  });

  it("answers clean on an empty status", async () => {
    // Arrange
    const w = world({ answers: { [GIT_STATUS_COMMAND]: { stdout: "\n" } } });

    // Act
    const answer = await runGitCommit(commitInput(), w.deps);

    // Assert
    strictEqual(answer, CLEAN);
  });

  it("refuses a secret-like path before any model call", async () => {
    // Arrange
    const w = world({ answers: { [GIT_STATUS_COMMAND]: { stdout: "?? .env\n" } } });

    // Act
    const answer = await runGitCommit(commitInput(), w.deps);

    // Assert
    assertStoppedBeforeDraft(answer, w, "✗ refused: .env usually holds a secret");
  });

  it("stops without a git identity before any model call", async () => {
    // Arrange
    const w = world({ answers: { "git var GIT_AUTHOR_IDENT": { stdout: "" } } });

    // Act
    const answer = await runGitCommit(commitInput(), w.deps);

    // Assert
    assertStoppedBeforeDraft(answer, w, "✗ stopped: git has no identity for the commit");
  });

  it("refuses a REFUSE: draft and commits nothing", async () => {
    // Arrange
    const w = world({ draft: "REFUSE: a.ts: an API token" });

    // Act
    const answer = await runGitCommit(commitInput(), w.deps);

    // Assert
    assertNotCommitted(answer, w, "✗ refused: the drafted message flagged a.ts: an API token");
  });
});

describe("runGitCommit: the commit and what follows it", () => {
  it("commits the selected files with the drafted message", async () => {
    // Arrange
    const w = world();

    // Act
    const answer = await runGitCommit(commitInput(), w.deps);

    // Assert
    assertCommitted(answer, w, `✓ committed abc1234 on feat/x\n${MESSAGE}`);
  });

  it("pushes when push is \"true\"", async () => {
    // Arrange
    const w = world();

    // Act
    const answer = await runGitCommit(commitInput({ push: "true" }), w.deps);

    // Assert
    assertMentions([answer, ...w.shell.commands].join("\n"), ["✓ pushed feat/x to origin", PUSH]);
  });

  it("opens the pull request through the opener when githubTool is set", async () => {
    // Arrange
    const w = world();

    // Act
    const answer = await runGitCommit(PR_WITH_TOOL, w.deps);

    // Assert
    assertMentions(answer, ["✓ pull request opened: https://example.com/pr/1"]);
  });

  it("hands the opener the session's mode, rules and asked flag", async () => {
    // Arrange
    const w = world();

    // Act
    await runGitCommit(PR_WITH_TOOL, w.deps);

    // Assert
    deepStrictEqual(w.policies, [{ mode: "default", rules: [], asked: true }]);
  });

  it("hands the pull request command over without asking for an opener when githubTool is absent", async () => {
    // Arrange
    const w = world();

    // Act
    const answer = await runGitCommit(commitInput({ pr: true }), w.deps);

    // Assert
    assertMentions([answer, `opener asked ${w.policies.length} time(s)`].join("\n"), [
      "to open the pull request, in a terminal:", "opener asked 0 time(s)",
    ]);
  });

  it("reads dev.prAuto when --pr is absent", async () => {
    // Arrange
    const w = world({ userSettings: { "dev.prAuto": "true" } });

    // Act
    const answer = await runGitCommit(commitInput(), w.deps);

    // Assert
    assertMentions(answer, ["to open the pull request, in a terminal:", `  ${PUSH}`]);
  });

  it("offers no pull request when neither a push, --pr nor dev.prAuto asks for one", async () => {
    // Arrange
    const w = world();

    // Act
    const answer = await runGitCommit(commitInput(), w.deps);

    // Assert
    assertOmits(answer, ["pull request"]);
  });
});

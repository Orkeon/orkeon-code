// The PullRequestOpener over the github tool: origin read, the gate's decision
// mirrored, the call made with the tool's arguments; every refusal a throw. Run:
//   node --test src/shared/application/git/open-pull-request.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";

import { withoutUserInfo } from "../../../../src/shared/application/git/open-pull-request.ts";
import { PR, refusedByGitHub, setup } from "./open-pull-request.fixtures.ts";

describe("createPullRequestOpener", () => {
  it("opens it with origin's owner and repository, the base, head, title and body", async () => {
    // Arrange
    const { created, opener } = setup();

    // Act
    const out = await opener.open(PR);

    // Assert
    deepStrictEqual(out, { url: "https://github.com/Orkeon/orkeon-code/pull/9" });
    deepStrictEqual(created, [{
      action: "create_pr", owner: "Orkeon", repo: "orkeon-code", base: "main", head: "feat/x", title: "fix: x", body: "## Batch\n",
    }]);
  });

  it("refuses without a base, before reading origin", async () => {
    // Arrange
    const { shell, created, opener } = setup();

    // Act
    const act = opener.open({ ...PR, base: null });

    // Assert
    await rejects(act, /base branch is unknown/);
    deepStrictEqual([shell.commands, created], [[], []]);
  });

  it("refuses an origin it cannot read", async () => {
    // Arrange
    const { created, opener } = setup({}, { exitCode: 2, stderr: "error: No such remote 'origin'" });

    // Act
    const act = opener.open(PR);

    // Assert
    await rejects(act, /No such remote 'origin'/);
    deepStrictEqual(created, []);
  });

  it("refuses an origin off github.com", async () => {
    // Arrange
    const { created, opener } = setup({}, { stdout: "https://gitlab.com/a/b.git\n" });

    // Act
    const act = opener.open(PR);

    // Assert
    await rejects(act, /not a github\.com repository \(https:\/\/gitlab\.com\/a\/b\.git\)/);
    deepStrictEqual(created, []);
  });

  it("never echoes a secret written in origin's URL", async () => {
    // Arrange
    const { opener } = setup({}, { stdout: "https://oauth2:glpat-SECRET@gitlab.com/a/b.git\n" });

    // Act
    const act = opener.open(PR);

    // Assert
    await rejects(act, (e: Error) => !e.message.includes("glpat") && e.message.includes("https://gitlab.com/a/b.git"));
  });

  it("leaves an origin URL without user info as it is", () => {
    // Arrange
    const url = "git@gitlab.com:a/b.git";

    // Act
    const shown = withoutUserInfo(url);

    // Assert
    deepStrictEqual(shown, "git@gitlab.com:a/b.git");
  });

  it("refuses what the gate would not run, and calls nothing", async () => {
    // Arrange
    const { created, opener } = setup({ asked: false });

    // Act
    const act = opener.open(PR);

    // Assert
    await rejects(act, /allow github action=create_pr/);
    deepStrictEqual(created, []);
  });

  it("lets GitHub's own failure through", async () => {
    // Arrange
    const opener = refusedByGitHub();

    // Act
    const act = opener.open(PR);

    // Assert
    await rejects(act, /401/);
  });
});

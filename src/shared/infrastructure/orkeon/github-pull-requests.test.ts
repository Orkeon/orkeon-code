// The GitHubPullRequests adapter over the github tool's create_pr. FakeTools
// fakes no github tool: a local stand-in records the input. Run:
//   node --test src/shared/infrastructure/orkeon/github-pull-requests.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";

import { ARGS, FAILURES, github } from "./github-pull-requests.fixtures.ts";

describe("createGitHubPullRequests", () => {
  it("passes the arguments as they are and answers the pull request's page", async () => {
    // Arrange
    const { inputs, pulls } = github({ action: "create_pr", success: true, items: [{ number: 9, url: "https://github.com/o/r/pull/9" }] });

    // Act
    const created = await pulls.create(ARGS);

    // Assert
    deepStrictEqual(created, { url: "https://github.com/o/r/pull/9" });
    deepStrictEqual(inputs, [ARGS]);
  });

  it("reads the PascalCase result, and the number when no url came", async () => {
    // Arrange
    const { pulls } = github({ Success: true, Items: [{ Number: 4 }] });

    // Act
    const created = await pulls.create(ARGS);

    // Assert
    deepStrictEqual(created, { url: "#4" });
  });

  for (const c of FAILURES) {
    it(c.name, async () => {
      // Arrange
      const { pulls } = github(c.reply);

      // Act
      const act = pulls.create(ARGS);

      // Assert
      await rejects(act, c.expected);
    });
  }
});

// The GitHubPullRequests adapter over the github tool's create_pr. FakeTools
// fakes no github tool: a local stand-in records the input. Run:
//   node --test src/shared/infrastructure/orkeon/github-pull-requests.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";

import { createGitHubPullRequests } from "./github-pull-requests.ts";
import type { CreatePrArgs } from "../../domain/git/pull-request.ts";

const ARGS: CreatePrArgs = { action: "create_pr", owner: "o", repo: "r", base: "main", head: "feat/x", title: "t", body: "b" };

function github(reply: unknown) {
  const inputs: unknown[] = [];
  const tools = { github: async (input: unknown) => { inputs.push(input); return reply; } } as unknown as Pick<OrkeonTools, "github">;
  return { inputs, pulls: createGitHubPullRequests(tools) };
}

describe("createGitHubPullRequests", () => {
  it("passes the arguments as they are and answers the pull request's page", async () => {
    const { inputs, pulls } = github({ action: "create_pr", success: true, items: [{ number: 9, url: "https://github.com/o/r/pull/9" }] });
    deepStrictEqual(await pulls.create(ARGS), { url: "https://github.com/o/r/pull/9" });
    deepStrictEqual(inputs, [ARGS]);
  });

  it("reads the PascalCase result, and the number when no url came", async () => {
    deepStrictEqual(await github({ Success: true, Items: [{ Number: 4 }] }).pulls.create(ARGS), { url: "#4" });
  });

  it("throws GitHub's first line on a failure, and a reason when there is none", async () => {
    await rejects(github({ success: false, error: "GitHub API returned 401: {\n\"message\": \"Requires authentication\"}" }).pulls.create(ARGS),
      { message: "GitHub API returned 401: {" });
    await rejects(github({ success: false }).pulls.create(ARGS), /without a reason/);
    await rejects(github({ success: true, items: [] }).pulls.create(ARGS), /without the pull request/);
  });
});

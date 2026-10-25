// The arguments and the github tool stand-in the createGitHubPullRequests tests use: FakeTools fakes no github tool.
import { createGitHubPullRequests } from "./github-pull-requests.ts";
import type { CreatePrArgs } from "../../domain/git/pull-request.ts";

export const ARGS: CreatePrArgs = { action: "create_pr", owner: "o", repo: "r", base: "main", head: "feat/x", title: "t", body: "b" };

/** A github tool answering `reply` and recording each input, and the adapter built over it. */
export function github(reply: unknown) {
  const inputs: unknown[] = [];
  const tools = { github: async (input: unknown) => { inputs.push(input); return reply; } } as unknown as Pick<OrkeonTools, "github">;
  return { inputs, pulls: createGitHubPullRequests(tools) };
}

export interface FailureCase {
  name: string;
  reply: unknown;
  expected: RegExp | { message: string };
}

/** The failures create throws on: GitHub's first line, a reason when there is none, no pull request in the reply. */
export const FAILURES: readonly FailureCase[] = [
  {
    name: "throws GitHub's first line on a failure",
    reply: { success: false, error: "GitHub API returned 401: {\n\"message\": \"Requires authentication\"}" },
    expected: { message: "GitHub API returned 401: {" },
  },
  { name: "throws a reason on a failure that gives none", reply: { success: false }, expected: /without a reason/ },
  { name: "throws when a success carries no pull request", reply: { success: true, items: [] }, expected: /without the pull request/ },
];

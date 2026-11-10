// GitHubPullRequests adapter over the runtime's `github` tool, action
// `create_pr`. The tool answers a failure as `success: false` with `error`
// (an HTTP refusal included), not a throw: this turns it into one, GitHub's
// first line as its message. The url is the pull request's page (`html_url`,
// read as `url`); without one, its number.

import type { GitHubPullRequests } from "../../application/git/open-pull-request.ts";
import { asArray, pick } from "./tool-results.ts";
import { GITHUB_FAILED_WITHOUT_REASON, GITHUB_SUCCESS_WITHOUT_PULL_REQUEST } from "./messages.ts";

function firstLine(text: unknown): string {
  return String(text ?? "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}

export function createGitHubPullRequests(tools: Pick<OrkeonTools, "github">): GitHubPullRequests {
  return {
    async create(args) {
      const r = await tools.github(args);
      if (pick(r, "success", "Success") !== true) {
        throw new Error(firstLine(pick(r, "error", "Error")) || GITHUB_FAILED_WITHOUT_REASON);
      }
      const item = asArray(pick(r, "items", "Items"))[0];
      const url = String(pick(item, "url", "Url") ?? "").trim();
      if (url.length > 0) return { url };
      const number = pick(item, "number", "Number");
      if (number == null) throw new Error(GITHUB_SUCCESS_WITHOUT_PULL_REQUEST);
      return { url: `#${number}` };
    },
  };
}

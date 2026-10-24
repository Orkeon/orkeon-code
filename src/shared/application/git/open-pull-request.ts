// The pull request opened by Orkeon Code itself (W0-C, Q-10): the PullRequestOpener
// of commit-files.ts over the runtime's `github` tool. It reads origin's
// repository, decides as the host gate would (shared/domain/git/pull-request.ts),
// then asks GitHub to open it. Every refusal is a throw carrying its reason:
// handOverPullRequest says it and hands the `gh pr create` command over.

import type { Shell } from "../ports.ts";
import type { PermissionRule } from "../../domain/agent-policy/permission.ts";
import type { CreatePrArgs } from "../../domain/git/pull-request.ts";
import { GITHUB_CREATE_PR, GIT_REMOTE_URL_COMMAND, parseGitHubRemote, pullRequestPermission } from "../../domain/git/pull-request.ts";
import type { PullRequest, PullRequestOpener } from "./commit-files.ts";
import { gitReason, runGit } from "./commit-files.ts";

/** The `create_pr` call of the github tool: the url of the pull request opened, or a throw with GitHub's reason. */
export interface GitHubPullRequests {
  create(args: CreatePrArgs): Promise<{ url: string }>;
}

/** What the decision reads: the session's mode and rules, and whether this run asked the user. */
export interface PullRequestPolicy {
  mode: string;
  rules: readonly PermissionRule[];
  asked: boolean;
}

export function createPullRequestOpener(
  deps: { shell: Pick<Shell, "run">; github: GitHubPullRequests },
  policy: PullRequestPolicy,
): PullRequestOpener {
  return {
    async open(pr: PullRequest): Promise<{ url: string }> {
      if (pr.base === null) throw new Error("the base branch is unknown (origin/HEAD is unset): git remote set-head origin --auto sets it");
      const remote = await runGit(deps.shell, GIT_REMOTE_URL_COMMAND);
      if (remote.exitCode !== 0) throw new Error(`origin's URL could not be read: ${gitReason(remote)}`);
      const repo = parseGitHubRemote(remote.stdout);
      if (repo === null) throw new Error(`origin is not a github.com repository (${remote.stdout.trim()})`);
      const args: CreatePrArgs = {
        action: GITHUB_CREATE_PR, owner: repo.owner, repo: repo.repo, base: pr.base, head: pr.head, title: pr.title, body: pr.body,
      };
      const permission = pullRequestPermission({ ...policy, args });
      if (!permission.ok) throw new Error(permission.reason);
      return deps.github.create(args);
    },
  };
}

// FakePullRequestOpener: the PullRequestOpener port. Each pull request it opens lands in `opened` and is
// answered `url`, or `open` throws `failure`, as the github tool refusing it does.
import type { PullRequest, PullRequestOpener } from "../../../src/shared/application/git/commit-files.ts";

export class FakePullRequestOpener implements PullRequestOpener {
  url = "https://example.com/pr/1";
  failure: Error | null = null;
  opened: PullRequest[] = [];

  async open(pr: PullRequest): Promise<{ url: string }> {
    if (this.failure) throw this.failure;
    this.opened.push(pr);
    return { url: this.url };
  }
}

// The PullRequestOpener over the github tool: origin read, the gate's decision
// mirrored, the call made with the tool's arguments; every refusal a throw. Run:
//   node --test src/shared/application/git/open-pull-request.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects } from "node:assert";

import { createPullRequestOpener, withoutUserInfo } from "./open-pull-request.ts";
import type { PullRequestPolicy } from "./open-pull-request.ts";
import type { CreatePrArgs } from "../../domain/git/pull-request.ts";
import { GIT_REMOTE_URL_COMMAND } from "../../domain/git/pull-request.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const PR = { base: "main", head: "feat/x", title: "fix: x", bodyFile: "workbench/pr-feat-x/PR.md", body: "## Batch\n" };

function setup(policy: Partial<PullRequestPolicy> = {}) {
  const shell = new FakeShell();
  shell.results[GIT_REMOTE_URL_COMMAND] = { stdout: "git@github.com:Orkeon/orkeon-code.git\n" };
  const created: CreatePrArgs[] = [];
  const github = { create: async (args: CreatePrArgs) => { created.push(args); return { url: "https://github.com/Orkeon/orkeon-code/pull/9" }; } };
  const opener = createPullRequestOpener({ shell, github }, { mode: "default", rules: [], asked: true, ...policy });
  return { shell, created, opener };
}

describe("createPullRequestOpener", () => {
  it("opens it with origin's owner and repository, the base, head, title and body", async () => {
    const { created, opener } = setup();
    deepStrictEqual(await opener.open(PR), { url: "https://github.com/Orkeon/orkeon-code/pull/9" });
    deepStrictEqual(created, [{
      action: "create_pr", owner: "Orkeon", repo: "orkeon-code", base: "main", head: "feat/x", title: "fix: x", body: "## Batch\n",
    }]);
  });

  it("refuses without a base, before reading origin", async () => {
    const { shell, created, opener } = setup();
    await rejects(opener.open({ ...PR, base: null }), /base branch is unknown/);
    deepStrictEqual([shell.commands, created], [[], []]);
  });

  it("refuses an origin it cannot read, or one off github.com", async () => {
    const unread = setup();
    unread.shell.results[GIT_REMOTE_URL_COMMAND] = { exitCode: 2, stderr: "error: No such remote 'origin'" };
    await rejects(unread.opener.open(PR), /No such remote 'origin'/);
    const elsewhere = setup();
    elsewhere.shell.results[GIT_REMOTE_URL_COMMAND] = { stdout: "https://gitlab.com/a/b.git\n" };
    await rejects(elsewhere.opener.open(PR), /not a github\.com repository \(https:\/\/gitlab\.com\/a\/b\.git\)/);
    deepStrictEqual([unread.created, elsewhere.created], [[], []]);
  });

  it("never echoes a secret written in origin's URL", async () => {
    const { shell, opener } = setup();
    shell.results[GIT_REMOTE_URL_COMMAND] = { stdout: "https://oauth2:glpat-SECRET@gitlab.com/a/b.git\n" };
    await rejects(opener.open(PR), (e: Error) => !e.message.includes("glpat") && e.message.includes("https://gitlab.com/a/b.git"));
    deepStrictEqual(withoutUserInfo("git@gitlab.com:a/b.git"), "git@gitlab.com:a/b.git");
  });

  it("refuses what the gate would not run, and calls nothing", async () => {
    const { created, opener } = setup({ asked: false });
    await rejects(opener.open(PR), /allow github action=create_pr/);
    deepStrictEqual(created, []);
  });

  it("lets GitHub's own failure through", async () => {
    const shell = new FakeShell();
    shell.results[GIT_REMOTE_URL_COMMAND] = { stdout: "https://github.com/o/r\n" };
    const github = { create: async () => { throw new Error("GitHub API returned 401"); } };
    await rejects(createPullRequestOpener({ shell, github }, { mode: "bypassPermissions", rules: [], asked: false }).open(PR), /401/);
  });
});

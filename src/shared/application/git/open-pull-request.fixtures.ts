// The pull request, the origins and the recording github stand-in for the PullRequestOpener tests.
import type { ShellResult } from "../ports.ts";
import type { PullRequestPolicy } from "./open-pull-request.ts";
import { createPullRequestOpener } from "./open-pull-request.ts";
import type { CreatePrArgs } from "../../domain/git/pull-request.ts";
import { GIT_REMOTE_URL_COMMAND } from "../../domain/git/pull-request.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";

export const PR = { base: "main", head: "feat/x", title: "fix: x", bodyFile: "workbench/pr-feat-x/PR.md", body: "## Batch\n" };

export const GITHUB_ORIGIN = { stdout: "git@github.com:Orkeon/orkeon-code.git\n" };

/** An opener over a shell whose origin answers `origin` (github.com by default) and a github tool that records
 *  each pull request it creates; `policy` overrides the gate's default, which allows the call. */
export function setup(policy: Partial<PullRequestPolicy> = {}, origin: Partial<ShellResult> = GITHUB_ORIGIN) {
  const shell = new FakeShell();
  shell.results[GIT_REMOTE_URL_COMMAND] = origin;
  const created: CreatePrArgs[] = [];
  const github = { create: async (args: CreatePrArgs) => { created.push(args); return { url: "https://github.com/Orkeon/orkeon-code/pull/9" }; } };
  const opener = createPullRequestOpener({ shell, github }, { mode: "default", rules: [], asked: true, ...policy });
  return { shell, created, opener };
}

/** An opener, allowed by bypassPermissions, over a github tool that answers 401. */
export function refusedByGitHub() {
  const shell = new FakeShell();
  shell.results[GIT_REMOTE_URL_COMMAND] = { stdout: "https://github.com/o/r\n" };
  const github = { create: async () => { throw new Error("GitHub API returned 401"); } };
  return createPullRequestOpener({ shell, github }, { mode: "bypassPermissions", rules: [], asked: false });
}

// The world the /commit use case is tested in: a git work tree answered by FakeShell, the files and the
// settings over FakeFiles, the draft by FakeLlm, the pull request by FakePullRequestOpener. No real git, no push.
import type { ShellResult } from "../../../../src/shared/application/ports.ts";
import type { PullRequestPolicy } from "../../../../src/shared/application/git/open-pull-request.ts";
import type { GitCommitDeps } from "../../../../src/crews/git-commit/application/run-git-commit.ts";
import { USER_CONFIG_FILE_PATH, createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { GIT_STATUS_COMMAND } from "../../../../src/shared/domain/git/close.ts";
import { FakeCrewMemory } from "../../../support/doubles/fake-crew-memory.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakePullRequestOpener } from "../../../support/doubles/fake-pull-request-opener.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";

export const MESSAGE = "fix(api): handle null";
export const PUSH = "git push -u origin 'feat/x'";
export const COMMIT = "git --literal-pathspecs commit -F .git/ORKEON_COMMITMSG -- 'a.ts'";
export const CLEAN = "Nothing to commit — working tree clean.";

/** A tree on feat/x with one modified file, a.ts, git's identity set and origin/HEAD on main. */
export const TREE_ANSWERS: Record<string, Partial<ShellResult>> = {
  [GIT_STATUS_COMMAND]: { stdout: " M a.ts\n" },
  "git var GIT_AUTHOR_IDENT": { stdout: "Ada <ada@example.com> 1700000000 +0100\n" },
  "git var GIT_COMMITTER_IDENT": { stdout: "Ada <ada@example.com> 1700000000 +0100\n" },
  "git --literal-pathspecs diff HEAD -- 'a.ts'": { stdout: "diff --git a/a.ts b/a.ts" },
  "git branch --show-current": { stdout: "feat/x\n" },
  "git log --oneline -10": { stdout: "abc0001 fix(api): earlier\n" },
  "git rev-parse --short HEAD": { stdout: "abc1234\n" },
  "git symbolic-ref --short refs/remotes/origin/HEAD": { stdout: "origin/main\n" },
};

/** The fakes of one run, and every policy the opener was asked for. */
export interface World {
  shell: FakeShell;
  files: FakeFiles;
  llm: FakeLlm;
  memory: FakeCrewMemory;
  log: FakeLogger;
  opener: FakePullRequestOpener;
  policies: PullRequestPolicy[];
  deps: GitCommitDeps;
}

/**
 * A run over the tree of TREE_ANSWERS, `answers` laid over it (a status, an identity), the model drafting
 * `draft`, and `userSettings` in the user's configuration (dev.prAuto, a key only the user sets).
 */
export function world(over: {
  answers?: Record<string, Partial<ShellResult>>;
  draft?: string;
  userSettings?: Record<string, string>;
} = {}): World {
  const shell = new FakeShell();
  const answers = { ...TREE_ANSWERS, ...over.answers };
  shell.answer = (command) => answers[command];
  const files = new FakeFiles();
  if (over.userSettings !== undefined) files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify(over.userSettings));
  const llm = new FakeLlm();
  llm.completions = [over.draft ?? MESSAGE];
  const memory = new FakeCrewMemory();
  const log = new FakeLogger();
  const opener = new FakePullRequestOpener();
  const policies: PullRequestPolicy[] = [];
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const deps: GitCommitDeps = {
    shell, files, config, llm, memory, log,
    openerFor: (policy) => {
      policies.push(policy);
      return opener;
    },
  };
  return { shell, files, llm, memory, log, opener, policies, deps };
}

/** The crew input /commit threads in a writing session, `over` replacing some keys. */
export function commitInput(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { permissionMode: "default", ...over };
}

/** A pull request asked for with the github tool registered, in a session that allows it. */
export const PR_WITH_TOOL = commitInput({
  pr: true, githubTool: true, prAsked: true, permissionRules: [],
});

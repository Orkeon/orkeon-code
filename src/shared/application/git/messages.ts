// The lines the git services report: a commit, a push, a pull request, a batch's worktree and its merge.

export const DETACHED_HEAD = "a detached HEAD";

// commit-files.ts
export const refusedByRuntime = (reason: string): string => `refused by the runtime: ${reason}`;
export const noEmailInAnswer = (command: string): string => `${command}: no email in its answer`;
export const NOTHING_TO_COMMIT = "nothing to commit";
export const cannotGoThroughShell = (paths: string): string => `cannot go through the shell: ${paths}`;
export const MERGE_IN_PROGRESS = "a merge or a cherry-pick is in progress: conclude it with git commit in a terminal";
export const gitAddFailed = (reason: string): string => `git add failed: ${reason}`;
export const gitCommitFailed = (reason: string, note: string | null): string =>
  `git commit failed: ${reason}${note === null ? "" : `; ${note}`}`;
export const removeByHand = (path: string, reason: string): string => `${path} could not be removed (${reason}): remove it by hand`;
export const commitMessageNotWritten = (file: string, fallback: string, reason: string): string =>
  `the commit message could not be written (${file}, ${fallback}): ${reason}`;
export const NOT_PUSHED_DETACHED = "not pushed: no branch is checked out (detached HEAD)";
export const notPushedUnsafeBranch = (branch: string): string => `not pushed: the branch name '${branch}' cannot go through the shell`;
export const pushRefused = (reason: string): string => `push refused, the commit stays local: ${reason}`;
export const bodyOutsideMounts = (folder: string, bodyFile: string): string =>
  `the body could not be written (${folder} is outside the mounts): write ${bodyFile} first`;
export const pullRequestBody = (bodyFile: string): string => `pull request body: ${bodyFile}`;
export const bodyNotWritten = (reason: string, bodyFile: string): string =>
  `⚠ the body could not be written (${reason}): write ${bodyFile} first`;
export const pullRequestOpened = (url: string): string => `✓ pull request opened: ${url}`;
export const pullRequestNotOpened = (reason: string): string => `✗ the pull request was not opened: ${reason}`;
export const TO_OPEN_IN_A_TERMINAL = "to open the pull request, in a terminal:";
export const NO_GITHUB_TOOL =
  "the pull request is opened here only through the github tool, which this host does not offer: run the command above";

// open-pull-request.ts
export const BASE_BRANCH_UNKNOWN = "the base branch is unknown (origin/HEAD is unset): git remote set-head origin --auto sets it";
export const originUrlUnreadable = (reason: string): string => `origin's URL could not be read: ${reason}`;
export const notAGitHubRepository = (url: string): string => `origin is not a github.com repository (${url})`;

// merge-batch.ts
export const notMergedUnsafe = (values: string): string => `not merged: ${values} cannot go through the shell`;
export const notMergedCheckoutElsewhere = (current: string, workBranch: string): string =>
  `not merged: the checkout is on '${current}', not on ${workBranch}`;
export const mergedFastForward = (ref: string, workBranch: string): string => `${ref} merged into ${workBranch} (fast-forward)`;
export const rebaseAbortFailed = (reason: string): string => `rebase --abort failed too: ${reason}`;
export const rebaseStopped = (reason: string, aborted: string): string => `not merged, the rebase stopped (${reason}); ${aborted}`;
export const rebasedAndMerged = (ref: string, workBranch: string): string =>
  `${ref} rebased on ${workBranch} and merged (fast-forward)`;
export const notMergedAfterRebase = (reason: string): string => `not merged after the rebase: ${reason}`;

// batch-worktree.ts
export const cannotGoThroughTheShell = (values: string): string => `${values} cannot go through the shell`;
export const notAWorktreeNameExplained = (name: string): string => `'${name}' is not a worktree name (one folder: letters, digits, . _ -)`;
export const branchExists = (branch: string): string => `branch ${branch} exists already: remove it or choose another name`;
export const orkeonNotIgnoredByGit = (path: string): string =>
  `${path} is not ignored by git: add \`.orkeon/\` to .gitignore or .git/info/exclude first`;
export const worktreeNotCreated = (path: string, reason: string): string => `worktree ${path} not created: ${reason}`;
export const worktreeCreated = (path: string, branch: string, base: string): string => `✓ worktree ${path} on ${branch}, from ${base}`;
export const worktreeStateUnreadable = (path: string, reason: string): string => `the state of ${path} could not be read (${reason})`;
export const worktreeHoldsChanges = (path: string, changed: number): string =>
  `${path} holds ${changed} uncommitted or untracked file(s): commit or discard them first`;
export const worktreeNotOnBranch = (path: string, branch: string, head: string): string =>
  `${path} is not on ${branch} (${head}): check it out there first`;
export const branchNotMerged = (branch: string, count: string, into: string): string =>
  `${branch} holds ${count} commit(s) not in ${into}: merge it first`;
export const mergedUnreadable = (branch: string, into: string, reason: string): string =>
  `whether ${branch} is merged into ${into} could not be read (${reason})`;
export const worktreeNotRemoved = (path: string, reason: string): string => `worktree ${path} not removed: ${reason}`;
export const worktreeAndBranchRemoved = (path: string, branch: string): string => `✓ worktree ${path} and branch ${branch} removed`;
export const worktreeRemovedBranchKept = (path: string, branch: string, reason: string): string =>
  `✓ worktree ${path} removed; branch ${branch} kept (${reason})`;
export const notMergedVerdict = (batch: string, verdict: string): string => `not merged: ${batch}'s audit is ${verdict}, not VALID`;
export const notMergedNotAWorktreeName = (name: string): string => `not merged: '${name}' is not a worktree name`;

// Shared by the crews that branch and push
export const refusedLine = (reason: string) => `✗ refused: ${reason}`;
export const branchCreated = (branch: string, from: string, pattern: string): string =>
  `✓ branch ${branch} created from ${from} (contrib.branch ${pattern})`;
export const pushedToOrigin = (branch: string): string => `✓ pushed ${branch} to origin`;

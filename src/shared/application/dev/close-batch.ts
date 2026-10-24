// The close of a dev batch (04 L-6, R-32): git's identity, a commit of the files
// the batch touched (never the work folder, even when one is named), the push,
// and the pull request handed over. It shares the git close with /commit
// (../git/commit-files.ts) and never calls /commit. A crew cannot
// ask: the pull request is opened only under `openPr` (--pr or dev.prAuto, Q-10),
// through the opener when one is wired, else its command is handed over (04 § 7).
// The opener over the github tool (../git/open-pull-request.ts) is to be built by
// L-6 with `asked: false`: only an allow rule on github, or bypassPermissions, opens it.
// L-6 builds the dev-implement crew around this use case; it sits in the shared
// dev layer until that crew exists (a crew folder without its crew is refused).

import type { Files, Shell } from "../ports.ts";
import type { PrSummary } from "../../domain/git/close.ts";
import { GIT_STATUS_COMMAND, identityStop, selectCommitFiles } from "../../domain/git/close.ts";
import type { PullRequestOpener } from "../git/commit-files.ts";
import {
  commitFiles, defaultBranch, gitReason, handOverPullRequest, pushBranch, readIdentity, runGit,
} from "../git/commit-files.ts";

export interface CloseBatchRequest {
  /** The files the batch touched, from its sheet and its roles' diffs. */
  touched: string[];
  message: string;
  branch: string;
  work: { folder: string; vfsPath: string | null };
  /** False in a batch worktree: the orchestrator merges and pushes once (D79). */
  push: boolean;
  openPr: boolean;
  summary: PrSummary;
  /** How the step is re-run, for the identity hand-over. */
  rerun: string;
}

export interface CloseBatchResult {
  committed: boolean;
  hash?: string;
  lines: string[];
}

export async function closeBatch(
  deps: { shell: Pick<Shell, "run">; files: Pick<Files, "write">; opener?: PullRequestOpener },
  req: CloseBatchRequest,
): Promise<CloseBatchResult> {
  const identity = await readIdentity(deps.shell);
  if (!identity.ok) return { committed: false, lines: [identityStop(identity.detail, req.rerun)] };

  const status = await runGit(deps.shell, GIT_STATUS_COMMAND);
  if (status.exitCode !== 0) return { committed: false, lines: [`✗ git status failed: ${gitReason(status)}`] };
  const selection = selectCommitFiles({ status: status.stdout, workFolder: req.work.folder, named: req.touched });
  const notes: string[] = [];
  if (selection.inWorkFolder.length > 0) notes.push(`left out (the work folder is never committed): ${selection.inWorkFolder.join(", ")}`);
  if (selection.unchanged.length > 0) notes.push(`no change to commit: ${selection.unchanged.join(", ")}`);
  if (selection.unsafe.length > 0) {
    return { committed: false, lines: [...notes, `✗ not committed: ${selection.unsafe.join(", ")} cannot go through the shell; commit by hand`] };
  }
  if (selection.files.length === 0) return { committed: false, lines: [...notes, "✗ nothing to commit"] };

  const commit = await commitFiles(deps, { files: selection.files, status: status.stdout, message: req.message });
  if (!commit.ok) return { committed: false, lines: [...notes, `✗ ${commit.line}`] };
  const lines = [...notes, `✓ committed ${commit.hash} on ${req.branch}: ${selection.files.length} file(s)`];
  if (!req.push) return { committed: true, hash: commit.hash, lines };

  const pushed = await pushBranch(deps.shell, req.branch);
  lines.push(pushed.ok ? `✓ pushed ${req.branch} to origin` : `✗ ${pushed.line}`);
  const base = await defaultBranch(deps.shell);
  if (base !== null && base === req.branch) return { committed: true, hash: commit.hash, lines };
  lines.push(...await handOverPullRequest(deps, {
    work: req.work, branch: req.branch, base, title: req.message.split("\n")[0], pushed: pushed.ok, open: req.openPr,
    summary: req.summary,
  }));
  return { committed: true, hash: commit.hash, lines };
}

// The merge of a local batch branch into the work branch (R-16): fast-forward
// only. Refused while the batch has its own worktree: the branch, never pushed, is
// rebased there on the work branch and the fast-forward tried again; a conflict
// aborts the rebase and the merge is handed over. Without a worktree nothing is
// rewritten here (a rebase would check the batch branch out in the user's own
// checkout): the merge is handed over. Never a forced update, never a push.
// Reached through batch-worktree.ts (mergeValidBatch), which a parallel /dev-batches calls for each VALID batch.

import type { Shell } from "../ports.ts";
import {
  GIT_CURRENT_BRANCH_COMMAND, gitMergeFfOnly, gitRebaseAbortIn, gitRebaseIn, isNotFastForward, shellUnsafe,
} from "../../domain/git/close.ts";
import { gitReason, runGit } from "./commit-files.ts";

export type MergeOutcome =
  | { merged: true; rebased: boolean; line: string }
  | { merged: false; line: string; handOver: string[] };

/** Merges `ref` into the checked-out `workBranch` by fast-forward, rebasing it in `worktree` when it has one. */
export async function mergeFastForward(
  shell: Pick<Shell, "run">,
  req: { ref: string; workBranch: string; worktree?: string },
): Promise<MergeOutcome> {
  const merge = gitMergeFfOnly(req.ref);
  // A leading `-` would be read by git as an option, as batch-worktree.ts refuses it.
  const unsafe = [req.ref, req.workBranch, ...(req.worktree === undefined ? [] : [req.worktree])]
    .filter((v) => shellUnsafe(v) || v.startsWith("-"));
  if (unsafe.length > 0) {
    return { merged: false, line: `not merged: ${unsafe.join(", ")} cannot go through the shell`, handOver: [merge] };
  }
  const current = (await runGit(shell, GIT_CURRENT_BRANCH_COMMAND)).stdout.trim();
  if (current !== req.workBranch) {
    return {
      merged: false, line: `not merged: the checkout is on '${current || "a detached HEAD"}', not on ${req.workBranch}`,
      handOver: [`git checkout ${req.workBranch}`, merge],
    };
  }
  const first = await runGit(shell, merge);
  if (first.exitCode === 0) return { merged: true, rebased: false, line: `${req.ref} merged into ${req.workBranch} (fast-forward)` };
  // Only a refusal for not being a fast-forward is cured by a rebase: a dirty tree or an unknown ref is said as it is.
  if (!isNotFastForward(first.stderr + first.stdout)) {
    return { merged: false, line: `not merged: ${gitReason(first)}`, handOver: [merge] };
  }
  if (req.worktree === undefined) {
    return {
      merged: false,
      line: `not merged: ${gitReason(first)}`,
      handOver: [`git rebase ${req.workBranch} ${req.ref}`, `git checkout ${req.workBranch}`, merge],
    };
  }
  const rebase = gitRebaseIn(req.worktree, req.workBranch);
  const rebased = await runGit(shell, rebase);
  if (rebased.exitCode !== 0) {
    const abort = await runGit(shell, gitRebaseAbortIn(req.worktree));
    const aborted = abort.exitCode === 0 ? "rebase aborted" : `rebase --abort failed too: ${gitReason(abort)}`;
    return { merged: false, line: `not merged, the rebase stopped (${gitReason(rebased)}); ${aborted}`, handOver: [rebase, merge] };
  }
  const second = await runGit(shell, merge);
  if (second.exitCode === 0) {
    return { merged: true, rebased: true, line: `${req.ref} rebased on ${req.workBranch} and merged (fast-forward)` };
  }
  return { merged: false, line: `not merged after the rebase: ${gitReason(second)}`, handOver: [merge] };
}

// A batch's worktree over the Shell port: created on its own branch under /workspace/.orkeon/worktrees/<name>,
// removed with its branch once its work is merged, and its branch merged into the work branch by fast-forward
// once its audit is VALID. The removal is refused while the worktree holds uncommitted or untracked files or
// its branch commits the work branch lacks, as the harness's `worktree-create.sh --remove`. Never `--force`,
// never a push: the plan's close pushes once (crews/dev-batches/application/plan-close.ts).
// The worktree is created with `git worktree add --relative-paths` (git 2.48 and later, no fallback: an older git
// fails the create with its own message), so that its `.git` file names the main git dir relatively and git works in
// it inside the runtime's sandbox, where the host's absolute path does not exist (Orkeon/orkeon#188).
// Called by a parallel /dev-batches (crews/dev-batches/application/run-wave.ts), whose batch agents each run
// under their worktree as a working root.
import type { Shell } from "../ports.ts";
import { shellUnsafe } from "../../domain/git/close.ts";
import {
  gitBranchDelete, gitBranchExists, gitCommitsNotIn, gitIsIgnored, gitIsMergedInto, gitWorktreeAdd, gitWorktreeHead,
  gitWorktreeRemove, gitWorktreeStatus,
  worktreePlace,
} from "../../domain/git/worktree.ts";
import type { WorktreePlace } from "../../domain/git/worktree.ts";
import { gitReason, runGit } from "./commit-files.ts";
import { mergeFastForward } from "./merge-batch.ts";
import type { MergeOutcome } from "./merge-batch.ts";
import {
  DETACHED_HEAD, branchExists, branchNotMerged, cannotGoThroughTheShell, mergedUnreadable, notAWorktreeName, notIgnoredByGit,
  notMergedNotAWorktreeName, notMergedVerdict, worktreeAndBranchRemoved, worktreeCreated, worktreeHoldsChanges, worktreeNotCreated,
  worktreeNotOnBranch, worktreeNotRemoved, worktreeRemovedBranchKept, worktreeStateUnreadable,
} from "./messages.ts";

export type WorktreeOutcome =
  | { ok: true; place: WorktreePlace; line: string }
  | { ok: false; line: string };

const refused = (line: string): { ok: false; line: string } => ({ ok: false, line: `refused: ${line}` });

// A leading `-` would be read by git as an option (`--detach` for a base).
function unsafeOf(values: readonly string[]): string | null {
  const bad = values.filter((v) => shellUnsafe(v) || v.startsWith("-"));
  return bad.length === 0 ? null : cannotGoThroughTheShell(bad.map((v) => `'${v}'`).join(", "));
}

/** Creates worktree `name` on a new branch `branch` from `base`. */
export async function createBatchWorktree(
  shell: Pick<Shell, "run">, req: { name: string; branch: string; base: string },
): Promise<WorktreeOutcome> {
  const place = worktreePlace(req.name);
  if (place === null) return refused(notAWorktreeName(req.name));
  const unsafe = unsafeOf([req.branch, req.base]);
  if (unsafe !== null) return refused(unsafe);
  const exists = await runGit(shell, gitBranchExists(req.branch));
  if (exists.exitCode === 0) return refused(branchExists(req.branch));
  // Not ignored, the worktree would sit in the checkout's own status as an embedded repository.
  const ignored = await runGit(shell, gitIsIgnored(place.path));
  if (ignored.exitCode !== 0) {
    return refused(notIgnoredByGit(place.path));
  }
  const add = await runGit(shell, gitWorktreeAdd(place.path, req.branch, req.base));
  if (add.exitCode !== 0) return { ok: false, line: worktreeNotCreated(place.path, gitReason(add)) };
  return { ok: true, place, line: worktreeCreated(place.path, req.branch, req.base) };
}

/** Removes worktree `name` and its branch once nothing in it is lost: no change, every commit in `into`. */
export async function removeBatchWorktree(
  shell: Pick<Shell, "run">, req: { name: string; branch: string; into: string },
): Promise<WorktreeOutcome> {
  const place = worktreePlace(req.name);
  if (place === null) return refused(notAWorktreeName(req.name));
  const unsafe = unsafeOf([req.branch, req.into]);
  if (unsafe !== null) return refused(unsafe);
  const status = await runGit(shell, gitWorktreeStatus(place.path));
  if (status.exitCode !== 0) return refused(worktreeStateUnreadable(place.path, gitReason(status)));
  const changed = status.stdout.split("\n").filter((l) => l.trim() !== "").length;
  if (changed > 0) return refused(worktreeHoldsChanges(place.path, changed));
  // The worktree must stand on its branch: commits on another HEAD would go with it, the merge check not seeing them.
  const head = await runGit(shell, gitWorktreeHead(place.path));
  if (head.exitCode !== 0 || head.stdout.trim() !== `refs/heads/${req.branch}`) {
    return refused(worktreeNotOnBranch(place.path, req.branch, head.exitCode === 0 ? head.stdout.trim() : DETACHED_HEAD));
  }
  const merged = await runGit(shell, gitIsMergedInto(req.branch, req.into));
  if (merged.exitCode === 1) {
    const count = await runGit(shell, gitCommitsNotIn(req.branch, req.into));
    const n = count.exitCode === 0 ? count.stdout.trim() : "?";
    return refused(branchNotMerged(req.branch, n, req.into));
  }
  if (merged.exitCode !== 0) return refused(mergedUnreadable(req.branch, req.into, gitReason(merged)));
  const remove = await runGit(shell, gitWorktreeRemove(place.path));
  if (remove.exitCode !== 0) return { ok: false, line: worktreeNotRemoved(place.path, gitReason(remove)) };
  const branch = await runGit(shell, gitBranchDelete(req.branch));
  return branch.exitCode === 0
    ? { ok: true, place, line: worktreeAndBranchRemoved(place.path, req.branch) }
    : { ok: true, place, line: worktreeRemovedBranchKept(place.path, req.branch, gitReason(branch)) };
}

/** Merges a batch's branch into the work branch (`--ff-only`, rebased in its worktree when needed) on a VALID verdict only. */
export async function mergeValidBatch(
  shell: Pick<Shell, "run">, req: { batch: string; verdict: string | null; branch: string; workBranch: string; name: string },
): Promise<MergeOutcome> {
  if (req.verdict !== "VALID") {
    return { merged: false, line: notMergedVerdict(req.batch, req.verdict ?? "missing"), handOver: [] };
  }
  const place = worktreePlace(req.name);
  if (place === null) return { merged: false, line: notMergedNotAWorktreeName(req.name), handOver: [] };
  return mergeFastForward(shell, { ref: req.branch, workBranch: req.workBranch, worktree: place.path });
}

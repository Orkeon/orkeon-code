// A batch's worktree over the Shell port: created on its own branch under /workspace/.orkeon/worktrees/<name>,
// removed with its branch once its work is merged, and its branch merged into the work branch by fast-forward
// once its audit is VALID. The removal is refused while the worktree holds uncommitted or untracked files or
// its branch commits the work branch lacks, as the harness's `worktree-create.sh --remove`. Never `--force`,
// never a push: the plan's close pushes once (crews/dev-batches/application/plan-close.ts).
// Not wired into a run yet: /dev-batches runs one batch at a time in /workspace (concurrency 1) and nothing
// but the tests calls these, until the runtime gives a script agent a working root of its own (D79).
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

export type WorktreeOutcome =
  | { ok: true; place: WorktreePlace; line: string }
  | { ok: false; line: string };

const refused = (line: string): { ok: false; line: string } => ({ ok: false, line: `refused: ${line}` });

// A leading `-` would be read by git as an option (`--detach` for a base).
function unsafeOf(values: readonly string[]): string | null {
  const bad = values.filter((v) => shellUnsafe(v) || v.startsWith("-"));
  return bad.length === 0 ? null : `${bad.map((v) => `'${v}'`).join(", ")} cannot go through the shell`;
}

/** Creates worktree `name` on a new branch `branch` from `base`. */
export async function createBatchWorktree(
  shell: Pick<Shell, "run">, req: { name: string; branch: string; base: string },
): Promise<WorktreeOutcome> {
  const place = worktreePlace(req.name);
  if (place === null) return refused(`'${req.name}' is not a worktree name (one folder: letters, digits, . _ -)`);
  const unsafe = unsafeOf([req.branch, req.base]);
  if (unsafe !== null) return refused(unsafe);
  const exists = await runGit(shell, gitBranchExists(req.branch));
  if (exists.exitCode === 0) return refused(`branch ${req.branch} exists already: remove it or choose another name`);
  // Not ignored, the worktree would sit in the checkout's own status as an embedded repository.
  const ignored = await runGit(shell, gitIsIgnored(place.path));
  if (ignored.exitCode !== 0) {
    return refused(`${place.path} is not ignored by git: add \`.orkeon/\` to .gitignore or .git/info/exclude first`);
  }
  const add = await runGit(shell, gitWorktreeAdd(place.path, req.branch, req.base));
  if (add.exitCode !== 0) return { ok: false, line: `worktree ${place.path} not created: ${gitReason(add)}` };
  return { ok: true, place, line: `✓ worktree ${place.path} on ${req.branch}, from ${req.base}` };
}

/** Removes worktree `name` and its branch once nothing in it is lost: no change, every commit in `into`. */
export async function removeBatchWorktree(
  shell: Pick<Shell, "run">, req: { name: string; branch: string; into: string },
): Promise<WorktreeOutcome> {
  const place = worktreePlace(req.name);
  if (place === null) return refused(`'${req.name}' is not a worktree name (one folder: letters, digits, . _ -)`);
  const unsafe = unsafeOf([req.branch, req.into]);
  if (unsafe !== null) return refused(unsafe);
  const status = await runGit(shell, gitWorktreeStatus(place.path));
  if (status.exitCode !== 0) return refused(`the state of ${place.path} could not be read (${gitReason(status)})`);
  const changed = status.stdout.split("\n").filter((l) => l.trim() !== "").length;
  if (changed > 0) return refused(`${place.path} holds ${changed} uncommitted or untracked file(s): commit or discard them first`);
  // The worktree must stand on its branch: commits on another HEAD would go with it, the merge check not seeing them.
  const head = await runGit(shell, gitWorktreeHead(place.path));
  if (head.exitCode !== 0 || head.stdout.trim() !== `refs/heads/${req.branch}`) {
    return refused(`${place.path} is not on ${req.branch} (${head.exitCode === 0 ? head.stdout.trim() : "a detached HEAD"}): check it out there first`);
  }
  const merged = await runGit(shell, gitIsMergedInto(req.branch, req.into));
  if (merged.exitCode === 1) {
    const count = await runGit(shell, gitCommitsNotIn(req.branch, req.into));
    const n = count.exitCode === 0 ? count.stdout.trim() : "?";
    return refused(`${req.branch} holds ${n} commit(s) not in ${req.into}: merge it first`);
  }
  if (merged.exitCode !== 0) return refused(`whether ${req.branch} is merged into ${req.into} could not be read (${gitReason(merged)})`);
  const remove = await runGit(shell, gitWorktreeRemove(place.path));
  if (remove.exitCode !== 0) return { ok: false, line: `worktree ${place.path} not removed: ${gitReason(remove)}` };
  const branch = await runGit(shell, gitBranchDelete(req.branch));
  return branch.exitCode === 0
    ? { ok: true, place, line: `✓ worktree ${place.path} and branch ${req.branch} removed` }
    : { ok: true, place, line: `✓ worktree ${place.path} removed; branch ${req.branch} kept (${gitReason(branch)})` };
}

/** Merges a batch's branch into the work branch (`--ff-only`, rebased in its worktree when needed) on a VALID verdict only. */
export async function mergeValidBatch(
  shell: Pick<Shell, "run">, req: { batch: string; verdict: string | null; branch: string; workBranch: string; name: string },
): Promise<MergeOutcome> {
  if (req.verdict !== "VALID") {
    return { merged: false, line: `not merged: ${req.batch}'s audit is ${req.verdict ?? "missing"}, not VALID`, handOver: [] };
  }
  const place = worktreePlace(req.name);
  if (place === null) return { merged: false, line: `not merged: '${req.name}' is not a worktree name`, handOver: [] };
  return mergeFastForward(shell, { ref: req.branch, workBranch: req.workBranch, worktree: place.path });
}

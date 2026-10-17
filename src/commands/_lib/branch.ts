// /branch — the uncommitted-changes guard, and the validation of a branch name
// before it reaches the shell (B-11 deepening); runBranch runs them over the
// Shell port. Lives under commands/_lib/ — the loader's SearchPattern is
// "*.cmd.ts", so this file is never loaded as a command.

import type { Logger, Shell } from "../../shared/application/ports.ts";
import type { CommandView } from "./view.ts";

/** True when `git status --porcelain` reported at least one changed path. */
export function hasUncommittedChanges(porcelain: unknown): boolean {
  return String(porcelain ?? "")
    .split("\n")
    .some((line) => line.trim().length > 0);
}

/** Branch names git itself accepts, minus anything a shell would reinterpret. */
const SAFE_BRANCH = /^[A-Za-z0-9._/\-]+$/;

export type BranchPlan =
  | { action: "show" }
  | { action: "checkout"; branch: string }
  | { action: "refuse"; reason: string };

/**
 * What `/branch [name]` should do.
 *
 * A bare `/branch` shows the current one (an addition of Orkeon Code: it is the question
 * asked most often and it costs nothing). A name is validated before it reaches the
 * shell — the tool allowlists `git`, so an unvalidated name is not an injection,
 * but `git checkout --orphan` typed as a "branch" is a different operation than the
 * one the operator asked for.
 */
export function planBranch(tokens: readonly string[]): BranchPlan {
  const name = String((tokens ?? [])[0] ?? "").trim();
  if (name.length === 0) return { action: "show" };
  if (name.startsWith("-")) {
    return { action: "refuse", reason: `'${name}' looks like an option, not a branch name` };
  }
  if (!SAFE_BRANCH.test(name)) {
    return {
      action: "refuse",
      reason: `'${name}' is not a plausible branch name (letters, digits, '.', '_', '/', '-')`,
    };
  }
  return { action: "checkout", branch: name };
}

/**
 * The refusal text for a dirty working tree.
 *
 * A refusal, not a warning: `git checkout` with local modifications either fails
 * with git's own error or carries the changes onto the new branch, and the second
 * outcome is the one that loses work quietly. The message names both ways out.
 */
export function describeDirtyTreeRefusal(branch: string, porcelain: string): string {
  const changed = porcelain.split("\n").filter((l) => l.trim().length > 0);
  const shown = changed.slice(0, 5).map((l) => `  ${l.trim()}`).join("\n");
  return (
    `refusing to check out '${branch}': ${changed.length} uncommitted change(s) in the working tree.\n` +
    `${shown}${changed.length > 5 ? `\n  … and ${changed.length - 5} more` : ""}\n` +
    "Commit them (/commit) or stash them first — a checkout would either fail or carry them across."
  );
}

export interface BranchDeps {
  shell: Shell;
  log: Pick<Logger, "warn">;
}

/** `/branch [name]`, from the command's raw tokens: the current branch, or the
 *  checkout of the named one unless the working tree holds changes. */
export async function runBranch(tokens: readonly string[], deps: BranchDeps): Promise<CommandView> {
  const { shell } = deps;
  const plan = planBranch(tokens);

  if (plan.action === "refuse") return { text: plan.reason };

  if (plan.action === "show") {
    const r = await shell.run("git branch --show-current");
    return { text: r.stdout.trim() || r.stderr.trim() || "(detached HEAD)" };
  }

  const status = await shell.run("git status --porcelain");
  const porcelain = status.stdout;
  if (status.exitCode === 0 && hasUncommittedChanges(porcelain)) {
    deps.log.warn(`/branch refused: uncommitted changes block the checkout of '${plan.branch}'`);
    return { text: describeDirtyTreeRefusal(plan.branch, porcelain) };
  }

  const r = await shell.run(`git checkout ${plan.branch}`);
  if (r.exitCode !== 0) {
    return { text: `checkout failed: ${r.stderr.trim() || r.stdout.trim() || `exit code ${r.exitCode}`}` };
  }
  return { text: r.stderr.trim() || r.stdout.trim() || `switched to '${plan.branch}'` };
}

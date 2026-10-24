// A batch's worktree: its name, where it lives - `/workspace/.orkeon/worktrees/<name>`, already under the
// project's mount and never under `.claude/` (the harness's) - and the git command lines that create,
// inspect and remove it. The shell runs in /workspace, so git is given the path relative to it; the
// absolute VFS path is the working root a batch's agent will run under. Pure.
import { shellQuote } from "./close.ts";

export const WORKTREES_FOLDER = ".orkeon/worktrees";
const WORKSPACE = "/workspace";
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface WorktreePlace {
  name: string;
  /** For git, relative to /workspace. */
  path: string;
  /** The VFS path: the batch's working root. */
  root: string;
}

/** The place of worktree `name`; null for a name that is not one folder (`/`, `..`, a leading `-` or `.`). */
export function worktreePlace(name: string): WorktreePlace | null {
  if (!NAME.test(name) || name.includes("..")) return null;
  const path = `${WORKTREES_FOLDER}/${name}`;
  return { name, path, root: `${WORKSPACE}/${path}` };
}

export const gitBranchExists = (branch: string): string => `git rev-parse --verify --quiet ${shellQuote(`refs/heads/${branch}`)}`;
export const gitWorktreeAdd = (path: string, branch: string, base: string): string =>
  `git worktree add -b ${shellQuote(branch)} ${shellQuote(path)} ${shellQuote(base)}`;
export const gitIsIgnored = (path: string): string => `git check-ignore -q ${shellQuote(path)}`;
export const gitWorktreeHead = (path: string): string => `git -C ${shellQuote(path)} symbolic-ref -q HEAD`;
export const gitWorktreeStatus = (path: string): string => `git -C ${shellQuote(path)} status --porcelain --untracked-files=all`;
export const gitIsMergedInto = (branch: string, into: string): string =>
  `git merge-base --is-ancestor ${shellQuote(`refs/heads/${branch}`)} ${shellQuote(into)}`;
export const gitCommitsNotIn = (branch: string, into: string): string =>
  `git rev-list --count ${shellQuote(`refs/heads/${branch}`)} --not ${shellQuote(into)}`;
// Never `--force`: git itself refuses a worktree with changes the status check missed.
export const gitWorktreeRemove = (path: string): string => `git worktree remove ${shellQuote(path)}`;
export const gitBranchDelete = (branch: string): string => `git branch -d ${shellQuote(branch)}`;

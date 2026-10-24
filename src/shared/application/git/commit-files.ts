// The git close shared by /commit (crews/git-commit) and the dev close
// (shared/application/dev/close-batch.ts): git's identity checked before
// anything is spent, an explicit file list committed, the branch pushed, and the
// pull request handed over. The rules and the command lines live in
// shared/domain/git/close.ts; this file runs them through the Shell and Files ports.

import type { Files, Shell, ShellResult } from "../ports.ts";
import type { GitIdent, PrSummary } from "../../domain/git/close.ts";
import {
  COMMIT_MESSAGE_FALLBACK, COMMIT_MESSAGE_FILE, GIT_COMMITTER_IDENT_COMMAND, GIT_IN_PROGRESS_PROBES, GIT_DEFAULT_BRANCH_COMMAND, GIT_HEAD_COMMAND, GIT_IDENT_COMMAND,
  ghPrCreateCommand, gitAddCommand, gitCommitCommand, gitPushCommand, indexDeletedPaths, parseDefaultBranch,
  parseGitIdent, prBodyPath, prSlug, renderPrBody, shellUnsafe,
} from "../../domain/git/close.ts";

export type Step = { ok: true } | { ok: false; line: string };

function firstLine(text: unknown): string {
  return String(text ?? "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}

/** Runs `command`; a runtime refusal (a throw) comes back as a failed result carrying its message. */
export async function runGit(shell: Pick<Shell, "run">, command: string): Promise<ShellResult> {
  try {
    return await shell.run(command);
  } catch (e) {
    return { stdout: "", stderr: `refused by the runtime: ${firstLine((e as Error)?.message ?? e)}`, exitCode: -1 };
  }
}

/** The first line git gave for a failure. */
export const gitReason = (r: ShellResult): string => firstLine(r.stderr) || firstLine(r.stdout) || `exit ${r.exitCode}`;

export type IdentityCheck = { ok: true; ident: GitIdent } | { ok: false; detail: string };

/**
 * git's own identity, author then committer (`git var`): the commit needs both.
 * None, or a check that cannot run, is not ok; nothing is ever invented.
 */
export async function readIdentity(shell: Pick<Shell, "run">): Promise<IdentityCheck> {
  let author: GitIdent | null = null;
  for (const command of [GIT_IDENT_COMMAND, GIT_COMMITTER_IDENT_COMMAND]) {
    const r = await runGit(shell, command);
    const ident = r.exitCode === 0 ? parseGitIdent(r.stdout) : null;
    if (ident === null) return { ok: false, detail: r.exitCode === 0 ? `${command}: no email in its answer` : gitReason(r) };
    author ??= ident;
  }
  return { ok: true, ident: author! };
}

/** `note`: what is left to do by hand once the commit is made (the message file it could not remove). */
export type CommitOutcome = { ok: true; hash: string; note?: string } | { ok: false; line: string };

/**
 * Stages and commits `files` alone, with `message` passed through a file (no
 * shell escaping). `status` is the one the list was selected from: a path it
 * shows gone from the index is left out of `git add`, which refuses it, and
 * stays in the commit's path list, which takes it from HEAD.
 */
export async function commitFiles(
  deps: { shell: Pick<Shell, "run">; files: Pick<Files, "write"> },
  req: { files: readonly string[]; status: string; message: string },
): Promise<CommitOutcome> {
  if (req.files.length === 0) return { ok: false, line: "nothing to commit" };
  const unsafe = req.files.filter(shellUnsafe);
  if (unsafe.length > 0) return { ok: false, line: `cannot go through the shell: ${unsafe.join(", ")}` };
  for (const probe of GIT_IN_PROGRESS_PROBES) {
    const r = await runGit(deps.shell, probe);
    if (r.exitCode === 0 && r.stdout.trim().length > 0) {
      return { ok: false, line: "a merge or a cherry-pick is in progress: conclude it with git commit in a terminal" };
    }
  }
  // The message is written before anything is staged: a write that fails leaves the index as it was.
  const messageFile = await writeMessage(deps.files, req.message);
  if (!messageFile.ok) return messageFile;
  const gone = indexDeletedPaths(req.status);
  const toAdd = req.files.filter((p) => !gone.includes(p));
  if (toAdd.length > 0) {
    const add = await runGit(deps.shell, gitAddCommand(toAdd));
    if (add.exitCode !== 0) return { ok: false, line: `git add failed: ${gitReason(add)}` };
  }
  const commit = await runGit(deps.shell, gitCommitCommand(req.files, messageFile.path));
  const note = messageFile.path === COMMIT_MESSAGE_FALLBACK ? await removeFallback(deps.shell) : null;
  if (commit.exitCode !== 0) return { ok: false, line: `git commit failed: ${gitReason(commit)}${note === null ? "" : `; ${note}`}` };
  const hash = (await runGit(deps.shell, GIT_HEAD_COMMAND)).stdout.trim();
  return note === null ? { ok: true, hash } : { ok: true, hash, note };
}

/** Removes the message written under `.orkeon/`; a removal that fails is said, never silent (the file holds the message). */
async function removeFallback(shell: Pick<Shell, "run">): Promise<string | null> {
  const rm = await runGit(shell, `rm -f ${COMMIT_MESSAGE_FALLBACK}`);
  return rm.exitCode === 0 ? null : `${COMMIT_MESSAGE_FALLBACK} could not be removed (${gitReason(rm)}): remove it by hand`;
}

/** The message under `.git/`, else - a linked worktree, whose `.git` is a file - under `.orkeon/`. */
async function writeMessage(files: Pick<Files, "write">, message: string): Promise<{ ok: true; path: string } | { ok: false; line: string }> {
  let reason = "";
  for (const path of [COMMIT_MESSAGE_FILE, COMMIT_MESSAGE_FALLBACK]) {
    try {
      await files.write(`/workspace/${path}`, message);
      return { ok: true, path };
    } catch (e) {
      reason = firstLine((e as Error)?.message ?? e);
    }
  }
  return { ok: false, line: `the commit message could not be written (${COMMIT_MESSAGE_FILE}, ${COMMIT_MESSAGE_FALLBACK}): ${reason}` };
}

/** `git push -u origin <branch>`; a refusal is said with git's line, nothing is forced. */
export async function pushBranch(shell: Pick<Shell, "run">, branch: string): Promise<Step> {
  if (branch.trim().length === 0) return { ok: false, line: "not pushed: no branch is checked out (detached HEAD)" };
  if (shellUnsafe(branch)) return { ok: false, line: `not pushed: the branch name '${branch}' cannot go through the shell` };
  const r = await runGit(shell, gitPushCommand(branch));
  return r.exitCode === 0 ? { ok: true } : { ok: false, line: `push refused, the commit stays local: ${gitReason(r)}` };
}

/** The remote's default branch, null when origin/HEAD is unset: never guessed. */
export async function defaultBranch(shell: Pick<Shell, "run">): Promise<string | null> {
  const r = await runGit(shell, GIT_DEFAULT_BRANCH_COMMAND);
  return r.exitCode === 0 ? parseDefaultBranch(r.stdout) : null;
}

export interface PullRequest {
  base: string | null;
  head: string;
  title: string;
  /** The body file as the user reads it (the handed-over command names it). */
  bodyFile: string;
  /** The body itself, which the opener sends. */
  body: string;
}

/** The pull request opened by Orkeon Code itself: open-pull-request.ts, over the github tool.
 *  A throw is the reason it was not opened; the command is then handed over. */
export interface PullRequestOpener {
  open(pr: PullRequest): Promise<{ url: string }>;
}

export interface PullRequestHandOver {
  /** The work folder: `folder` as the user reads it, `vfsPath` where it is written (null outside the mounts). */
  work: { folder: string; vfsPath: string | null };
  branch: string;
  base: string | null;
  title: string;
  pushed: boolean;
  /** `--pr` or `dev.prAuto`: open it rather than hand it over. */
  open: boolean;
  summary: PrSummary;
}

/** Writes `<work>/pr-<slug>/PR.md`, then opens the pull request through the seam, or prints the command. */
export async function handOverPullRequest(
  deps: { files: Pick<Files, "write">; opener?: PullRequestOpener },
  req: PullRequestHandOver,
): Promise<string[]> {
  const slug = prSlug(req.branch);
  const bodyFile = prBodyPath(req.work.folder, slug);
  const lines: string[] = [];
  const body = renderPrBody(req.summary);
  if (req.work.vfsPath === null) {
    lines.push(`the body could not be written (${req.work.folder} is outside the mounts): write ${bodyFile} first`);
  } else {
    // After the commit and the push: a body that cannot be written is said, never thrown.
    try {
      await deps.files.write(`${req.work.vfsPath.replace(/\/+$/, "")}/pr-${slug}/PR.md`, body);
      lines.push(`pull request body: ${bodyFile}`);
    } catch (e) {
      lines.push(`⚠ the body could not be written (${firstLine((e as Error)?.message ?? e)}): write ${bodyFile} first`);
    }
  }
  const pr: PullRequest = { base: req.base, head: req.branch, title: req.title, bodyFile, body };
  if (req.open && req.pushed && deps.opener !== undefined) {
    try {
      return [...lines, `✓ pull request opened: ${(await deps.opener.open(pr)).url}`];
    } catch (e) {
      lines.push(`✗ the pull request was not opened: ${firstLine((e as Error)?.message ?? e)}`);
    }
  }
  lines.push("to open the pull request, in a terminal:");
  if (!req.pushed) lines.push(`  ${gitPushCommand(req.branch)}`);
  lines.push(`  ${ghPrCreateCommand(pr)}`);
  if (req.open && deps.opener === undefined) {
    lines.push("the pull request is opened here only through the github tool, which this host does not offer: run the command above");
  }
  return lines;
}

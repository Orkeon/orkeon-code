// GitCommit use case — inspect the work tree, draft a message, commit safely.
// Orchestration only; pure cleanup lives in ../domain/commit, IO behind the ports.

import type { CrewMemory, Files, Llm, Shell } from "../../../shared/application/ports.ts";
import { normalizeCommitMessage, commitSubject, isCommitPermitted } from "../domain/commit.ts";

export interface WorkTree {
  status: string;
  diff: string;
  branch: string;
  recent: string;
}

/** Snapshot the working tree (mode B — shell only). */
export async function inspectWorkTree(shell: Shell): Promise<WorkTree> {
  const status = (await shell.run("git status --short")).stdout;
  const diff = (await shell.run("git diff HEAD")).stdout;
  const branch = (await shell.run("git branch --show-current")).stdout.trim();
  const recent = (await shell.run("git log --oneline -10")).stdout;
  return { status, diff, branch, recent };
}

/** Build the Conventional-Commits drafting prompt (Git Safety Protocol baked in). */
export function buildCommitPrompt(t: WorkTree): string {
  return (
    "You are a release engineer. Write ONE Conventional-Commits message " +
    "(type(scope): subject, then an optional body) for the staged changes below. " +
    "Rules: never amend, never skip hooks, never include secrets. Output ONLY the message.\n\n" +
    `Branch: ${t.branch}\n\nRecent history:\n${t.recent}\n\nStatus:\n${t.status}\n\nDiff (truncated):\n${t.diff.slice(0, 6000)}`
  );
}

/** Draft + clean the commit message (mode C), and keep it in the crew's memory. */
export async function draftCommitMessage(
  deps: { llm: Pick<Llm, "complete">; memory: CrewMemory },
  t: WorkTree,
): Promise<string> {
  const raw = await deps.llm.complete(buildCommitPrompt(t));
  const message = normalizeCommitMessage(raw);
  await deps.memory.store("commit_message", message);
  return message;
}

/**
 * Stage everything and commit via a here-doc-safe message file (mode B).
 *
 * B-1: the mode is checked HERE as well as in the crew body, before the first
 * shell call. Two guards on one path looks redundant until you ask which one
 * fails: the body's check protects the round-trip a caller can see, this one
 * protects the function from a future caller that forgets. The round-40 finding
 * was precisely a guard that existed somewhere else.
 */
export async function commitAll(
  t: WorkTree,
  message: string,
  mode: unknown,
  deps: { shell: Shell; files: Files },
): Promise<string> {
  const permitted = isCommitPermitted(mode);
  if (!permitted.allowed) return `✗ refused: ${permitted.reason}`;

  const add = await deps.shell.run("git add -A");
  if (add.exitCode !== 0) return `✗ git add failed: ${add.stderr}`;

  // Write the message under the workspace's own .git/ (rw mount, never tracked,
  // no shell escaping). cwd=/workspace so the relative -F path resolves.
  await deps.files.write("/workspace/.git/ORKEON_COMMITMSG", message);
  const commit = await deps.shell.run("git commit -F .git/ORKEON_COMMITMSG");
  if (commit.exitCode !== 0) return `✗ git commit failed: ${commit.stderr || commit.stdout}`;

  const hash = (await deps.shell.run("git rev-parse --short HEAD")).stdout.trim();
  return `✓ committed ${hash} on ${t.branch}\n${commitSubject(message)}`;
}

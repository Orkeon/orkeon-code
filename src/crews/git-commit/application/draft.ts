// GitCommit use case — inspect the work tree, draft a message, commit safely.
// Orchestration only; pure cleanup lives in ../domain/commit, IO behind the ports.

import type { CrewMemory, Files, Llm, Shell } from "../../../shared/application/ports.ts";
import type { PromptPair } from "../../../shared/domain/types.ts";
import { normalizeCommitMessage, commitSubject, isCommitPermitted, untrackedPaths } from "../domain/commit.ts";
import { GIT_STATUS_COMMAND, changedPaths, gitDiffCommand } from "../../../shared/domain/git/close.ts";
import { commitFiles } from "../../../shared/application/git/commit-files.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";
import { committed, refused } from "./messages.ts";
import {
  authorNotePart, branchPart, COMMIT_SYSTEM, cutNote, diffPart, NEW_FILES_LABEL, newFilePart, recentHistoryPart, statusPart,
} from "./prompts.ts";

export interface WorkTree {
  status: string;
  diff: string;
  branch: string;
  recent: string;
  /** The untracked files the commit adds, with the start of their content:
   *  `git diff HEAD` does not show them, so without this the message is blind to them. */
  untracked: Array<{ path: string; content: string }>;
  /** The author's reason for this commit (`/commit --note`), present only when one was given. */
  note?: string;
}

/** The working tree's status, as the selection of the commit's files reads it. */
export async function readStatus(shell: Shell): Promise<string> {
  return (await shell.run(GIT_STATUS_COMMAND)).stdout;
}

/** The lines of `status` that name one of `files` (either side of a rename). */
function statusOf(status: string, files: readonly string[]): string {
  return status.split("\n").filter((line) => changedPaths(line).some((p) => files.includes(p))).join("\n");
}

/** Characters of the tracked diff the drafting prompt shows. */
export const MAX_COMMIT_DIFF_CHARS = 6_000;
/** Characters of each new file it shows, and how many new files. */
export const MAX_NEW_FILE_CHARS = 2_000;
export const MAX_NEW_FILES = 10;

/** `text` cut at `max` characters, saying how much was left out when it was cut. */
function cut(text: string, max: number, what: string): string {
  return text.length <= max ? text : `${text.slice(0, max)}${cutNote(what, max, text.length - max)}`;
}

/**
 * Snapshot the working tree (mode B — shell, and the files for the new ones).
 * With a `scope`, the snapshot shows the selected files alone: their status lines
 * and their diff, which is what the commit will hold, and carries the author's note
 * when it holds a non-blank one.
 */
export async function inspectWorkTree(
  shell: Shell,
  files?: Pick<Files, "read">,
  scope?: { status: string; files: readonly string[]; note?: string },
): Promise<WorkTree> {
  const status = scope ? statusOf(scope.status, scope.files) : await readStatus(shell);
  const diff = (await shell.run(scope ? gitDiffCommand(scope.files) : "git diff HEAD")).stdout;
  const branch = (await shell.run("git branch --show-current")).stdout.trim();
  const recent = (await shell.run("git log --oneline -10")).stdout;
  const untracked: WorkTree["untracked"] = [];
  if (files) {
    for (const path of untrackedPaths(status).slice(0, MAX_NEW_FILES)) {
      try {
        untracked.push({ path, content: await files.read(`${WORKSPACE}/${path}`, MAX_NEW_FILE_CHARS + 1) });
      } catch { /* unreadable (binary, gone): the status still names it */ }
    }
  }
  const note = (scope?.note ?? "").trim();
  return { status, diff, branch, recent, untracked, ...(note.length > 0 ? { note } : {}) };
}

/**
 * The commit-message prompt: the rules as the system message, the change as the
 * user message (material, never instructions). The model may refuse with
 * COMMIT_REFUSAL_PREFIX when the change looks like it adds a credential; the crew
 * then commits nothing.
 */
export function buildCommitPrompt(t: WorkTree): PromptPair {
  const parts = [
    branchPart(t.branch),
    recentHistoryPart(t.recent.trimEnd()),
    statusPart(t.status.trimEnd()),
    ...(t.note !== undefined && t.note.trim().length > 0 ? [authorNotePart(t.note.trim())] : []),
    diffPart(cut(t.diff, MAX_COMMIT_DIFF_CHARS, "diff").trimEnd()),
  ];
  const fresh = t.untracked ?? [];
  if (fresh.length > 0) {
    parts.push(NEW_FILES_LABEL + fresh.map((f) => newFilePart(f.path, cut(f.content, MAX_NEW_FILE_CHARS, "file").trimEnd())).join("\n"));
  }
  return { system: COMMIT_SYSTEM, user: parts.join("\n\n") };
}

/** Draft + clean the commit message (mode C), and keep it in the crew's memory. */
export async function draftCommitMessage(
  deps: { llm: Pick<Llm, "complete">; memory: CrewMemory },
  t: WorkTree,
): Promise<string> {
  const prompt = buildCommitPrompt(t);
  const raw = await deps.llm.complete(prompt.user, { system: prompt.system });
  const message = normalizeCommitMessage(raw);
  await deps.memory.store("commit_message", message);
  return message;
}

/**
 * Stage and commit the selected files alone, the message through a file (mode B),
 * by the git close shared with the dev close (shared/application/git/commit-files).
 *
 * The mode is checked HERE as well as in the crew body, before the first shell
 * call. Two guards on one path looks redundant until you ask which one fails: the
 * body's check protects the round-trip a caller can see, this one protects the
 * function from a future caller that forgets.
 */
export async function commitSelected(
  t: WorkTree,
  message: string,
  mode: unknown,
  selection: { files: readonly string[]; status: string },
  deps: { shell: Shell; files: Files },
): Promise<string> {
  const permitted = isCommitPermitted(mode);
  if (!permitted.allowed) return refused(permitted.reason);

  // The message goes to a file for `git commit -F` (no shell escaping): under the workspace's .git/, or, in a linked
  // worktree whose .git is a file, under .orkeon/ and removed after (commit-files.ts).
  const commit = await commitFiles(deps, { files: selection.files, status: selection.status, message });
  if (!commit.ok) return `✗ ${commit.line}`;
  return committed(commit.hash, t.branch, commitSubject(message), commit.note);
}

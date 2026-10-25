// Resolves the work folder of the checkout from the request that applies (the
// dev.workDir config key, else the pack's layout.work; see pickWorkDirRequest),
// with the outcomes of the harness's own resolution: the default, the folder
// asked, an absent or invalid request falling back to the default with a note,
// and the case of a secondary worktree, where the folder found in the primary
// checkout applies. It reads directory listings and runs git; it creates nothing.

import type { Files, Shell } from "../ports.ts";
import type { WorkDirRequest } from "../../domain/dev/work-folder.ts";
import {
  DEFAULT_WORK_FOLDER, isSamePath, mainWorktreeOf, normalizeWorkDir,
} from "../../domain/dev/work-folder.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export const GIT_WORKTREE_LIST = "git worktree list --porcelain";
export const GIT_TOPLEVEL = "git rev-parse --show-toplevel";

/** `git -C <folder> rev-parse --git-dir`: exit 0 iff the folder exists (inside the repository). */
export function gitDirProbe(absoluteFolder: string): string {
  return `git -C ${absoluteFolder} rev-parse --git-dir`;
}

export type WorkFolderOutcome = "default" | "applied" | "absent" | "invalid" | "main-worktree";

export interface WorkFolder {
  /** "workbench", "backstage/tasks", or the main worktree's absolute folder. */
  folder: string;
  /** "/workspace/<folder>"; null for "main-worktree" (outside the mounts). */
  vfsPath: string | null;
  outcome: WorkFolderOutcome;
  request: WorkDirRequest | null;
  exists: boolean;
  /** A warning text, null when nothing to say. */
  note: string | null;
}

/** Characters a path must not hold to go unquoted into the probe's command line. */
const UNSAFE_FOR_SHELL = /[\s'"`$\;&|<>()*?[\]{}!#~]/;

/** True when the parent's listing (cap 1000) holds the last segment; a listing that throws = false. */
export async function entryExists(files: Pick<Files, "list">, vfsPath: string): Promise<boolean> {
  const path = vfsPath.replace(/\/+$/, "");
  const cut = path.lastIndexOf("/");
  if (cut < 0) return false;
  const parent = cut === 0 ? "/" : path.slice(0, cut);
  const name = path.slice(cut + 1);
  if (name === "") return false;
  try {
    const entries = await files.list(parent, 1000);
    return entries.some((e) => e === name || e === `${name}/`);
  } catch {
    return false;
  }
}

async function gitStdout(shell: Pick<Shell, "run">, command: string): Promise<string | null> {
  try {
    const result = await shell.run(command);
    return result.exitCode === 0 ? result.stdout : null;
  } catch {
    return null;
  }
}

async function probeSucceeds(shell: Pick<Shell, "run">, command: string): Promise<boolean> {
  try {
    return (await shell.run(command)).exitCode === 0;
  } catch {
    return false;
  }
}

export async function resolveWorkFolder(
  deps: { files: Pick<Files, "list">; shell: Pick<Shell, "run"> },
  request: WorkDirRequest | null,
): Promise<WorkFolder> {
  const defaultVfs = `${WORKSPACE}/${DEFAULT_WORK_FOLDER}`;
  const fallback = async (outcome: WorkFolderOutcome, note: string | null): Promise<WorkFolder> => ({
    folder: DEFAULT_WORK_FOLDER,
    vfsPath: defaultVfs,
    outcome,
    request,
    exists: await entryExists(deps.files, defaultVfs),
    note,
  });

  if (request === null) return fallback("default", null);
  const check = normalizeWorkDir(request.value);
  if (!check.ok) {
    return fallback("invalid",
      `${request.source} '${request.value}' is not a relative folder of the checkout (${check.reason}): ${DEFAULT_WORK_FOLDER}/ applies`);
  }
  const value = check.folder;
  if (value === "") return fallback("default", null);

  const vfsPath = `${WORKSPACE}/${value}`;
  if (value === DEFAULT_WORK_FOLDER) {
    return { folder: value, vfsPath, outcome: "applied", request, exists: await entryExists(deps.files, vfsPath), note: null };
  }
  if (await entryExists(deps.files, vfsPath)) {
    return { folder: value, vfsPath, outcome: "applied", request, exists: true, note: null };
  }

  const absentNote = `${request.source} '${value}' is absent from the checkout: ${DEFAULT_WORK_FOLDER}/ applies`;
  const porcelain = await gitStdout(deps.shell, GIT_WORKTREE_LIST);
  const toplevel = await gitStdout(deps.shell, GIT_TOPLEVEL);
  const main = porcelain === null ? null : mainWorktreeOf(porcelain);
  if (main === null || toplevel === null || isSamePath(main, toplevel.trim())) {
    return fallback("absent", absentNote);
  }
  const folder = `${main.replace(/\/+$/, "")}/${value}`;
  if (UNSAFE_FOR_SHELL.test(folder) || !(await probeSucceeds(deps.shell, gitDirProbe(folder)))) {
    return fallback("absent", absentNote);
  }
  return {
    folder,
    vfsPath: null,
    outcome: "main-worktree",
    request,
    exists: true,
    note: `this checkout is a linked worktree: the work folder is the main worktree's ${folder}`,
  };
}

/** "workbench/ (default)", "backstage/tasks/ (layout.work, .orkeon/repo.yaml)", "todo/ (dev.workDir)". */
export function workFolderLabel(work: WorkFolder, packShown: string | null): string {
  const applied = work.outcome === "applied" || work.outcome === "main-worktree";
  if (!applied || work.request === null) return `${work.folder}/ (default)`;
  if (work.request.source === "layout.work") {
    return `${work.folder}/ (layout.work${packShown === null ? "" : `, ${packShown}`})`;
  }
  return `${work.folder}/ (dev.workDir)`;
}

// Reading the project manifests and the CI workflows, shared by /init (project-init) and
// /init-verifiers: the files that exist, each cut at MAX_CONFIG_FILE_CHARS, in the order of the domain
// module (commands first, rules after), and their rendering as material, bounded as a whole.

import type { Files } from "./ports.ts";
import {
  CI_WORKFLOWS_DIR, COMMAND_MANIFESTS, CONFIG_CANDIDATES, MAX_CONFIG_FILE_CHARS, MAX_MANIFESTS_MATERIAL_CHARS,
  RULE_CONFIGS, cutLine, expandCandidates, isSuffixCandidate, leftOutLine,
} from "../domain/project-manifests.ts";
import { WORKSPACE } from "../domain/vfs.ts";

/** Entries of the workspace root listed to match the suffix candidates (`*.csproj`). */
const MAX_TOP_LEVEL_ENTRIES = 200;
/** Workflow files listed under CI_WORKFLOWS_DIR. */
const MAX_WORKFLOWS = 20;

/** A manifest as read: its path relative to the workspace root, its content cut at MAX_CONFIG_FILE_CHARS;
 *  `cut`, when set, the characters left out of its end. */
export interface ManifestText { path: string; content: string; cut?: number }

/**
 * The manifests of `candidates` that exist and are not empty, in candidate order. A suffix candidate
 * (`*.csproj`) is matched against one listing of the workspace root, made only when `files` can list
 * and a suffix candidate is asked; without `list` it is skipped. An absent or unreadable file is skipped.
 */
export async function readManifests(
  files: Pick<Files, "read"> & Partial<Pick<Files, "list">>,
  candidates: readonly string[] = CONFIG_CANDIDATES,
): Promise<ManifestText[]> {
  let topLevel: string[] = [];
  if (files.list && candidates.some(isSuffixCandidate)) {
    try {
      topLevel = await files.list(WORKSPACE, MAX_TOP_LEVEL_ENTRIES);
    } catch { /* unlistable — the suffix candidates match nothing */ }
  }
  const found: ManifestText[] = [];
  for (const path of expandCandidates(candidates, topLevel)) {
    try {
      const content = await files.read(`${WORKSPACE}/${path}`);
      if (content.length === 0) continue;
      const cut = content.length - MAX_CONFIG_FILE_CHARS;
      found.push(cut > 0 ? { path, content: content.slice(0, MAX_CONFIG_FILE_CHARS), cut } : { path, content });
    } catch { /* absent or unreadable — skip */ }
  }
  return found;
}

/** The file names under CI_WORKFLOWS_DIR; none when the folder is absent. */
export async function listCiWorkflows(files: Pick<Files, "list">): Promise<string[]> {
  try {
    return await files.list(`${WORKSPACE}/${CI_WORKFLOWS_DIR}`, MAX_WORKFLOWS);
  } catch {
    return [];
  }
}

/**
 * The CI workflows under CI_WORKFLOWS_DIR as manifests (path `.github/workflows/<name>`), in listing
 * order, each cut at MAX_CONFIG_FILE_CHARS: often the only place the project's real check sequence is
 * written. None when the folder is absent; an empty or unreadable file is skipped.
 */
export async function readCiWorkflows(files: Pick<Files, "list" | "read">): Promise<ManifestText[]> {
  const paths = (await listCiWorkflows(files)).map((name) => `${CI_WORKFLOWS_DIR}/${name}`);
  return await readManifests(files, paths);
}

/**
 * Every configuration both crews read, in the domain's order rule: the manifests that state commands, then
 * the CI workflows, then the configurations that state rules, `CONTRIBUTING.md` last.
 */
export async function readConfigFiles(files: Pick<Files, "list" | "read">): Promise<ManifestText[]> {
  return [
    ...await readManifests(files, COMMAND_MANIFESTS),
    ...await readCiWorkflows(files),
    ...await readManifests(files, RULE_CONFIGS),
  ];
}

/** One `<file path="…">` block, its cut line closing it when the manifest was cut. */
function fileBlock(m: ManifestText): string {
  const cut = (m.cut ?? 0) > 0 ? `\n${cutLine(m.cut ?? 0)}` : "";
  return `<file path="${m.path}">\n${m.content}${cut}\n</file>`;
}

/**
 * The manifests as material: one `<file path="…">` block each, in order, whole files kept while the total
 * stays within `max` characters (a block that does not fit is left out, a later smaller one may still fit),
 * then a line naming the files left out when there are any.
 */
export function manifestsAsMaterial(manifests: readonly ManifestText[], max = MAX_MANIFESTS_MATERIAL_CHARS): string {
  const kept: string[] = [];
  const leftOut: string[] = [];
  let size = 0;
  for (const m of manifests) {
    const block = fileBlock(m);
    const added = block.length + (kept.length > 0 ? 1 : 0);
    if (size + added > max) {
      leftOut.push(m.path);
      continue;
    }
    kept.push(block);
    size += added;
  }
  if (leftOut.length > 0) kept.push(leftOutLine(leftOut, max));
  return kept.join("\n");
}

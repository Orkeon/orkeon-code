// The files a batch's worktree needs and does not get from git, and the ones it writes back. The driver of a
// parallel /dev-batches, only writer of the main checkout, seeds the worktree before the batch agent is built - the
// work code's folder (plan, sheets, verdicts), its dev state, the config, the session's settings, the packs and the
// shared memory, none of them tracked in every repository - and, once a VALID batch is merged, harvests the files
// the batch owns: the names carry its batch (sheet and verdict `*-F<n>.md`, `capture-F<n>/`, the logs `F<n>-*`,
// `implement-F<n>.json`); the plan never comes back, a batch's done being read from its sheet (L7-D3).
//
// Both go through the Files port, file by file: the runtime's shell_command refuses `&&`, `;` and `|`
// (ShellCommandTool.cs, s_forbiddenOperators) and allows no `cp`. The seed is an explicit copy: a fresh worktree's
// files equal the main checkout's, whatever the mtime git gave its committed copies; a reused one keeps the files
// its batch owns (its ticks, its verdict), the rest refreshed. The seed answers a snapshot of the main checkout's
// copies of those owned files, and the harvest brings back only what the batch changed against it, never over a
// file the main checkout changed meanwhile (that one is named, the batch's copy staying in the worktree).
import type { Files } from "../../../shared/application/ports.ts";
import { isCode } from "../../../shared/domain/dev/artefacts.ts";
import type { WorktreePlace } from "../../../shared/domain/git/worktree.ts";

export interface SeedTarget {
  place: WorktreePlace;
  /** The work folder, relative to the checkout ("todo", "backstage/tasks"). */
  work: string;
  code: string;
  /** memory.dir, relative to the checkout. */
  memoryDir: string;
  batch: string;
}

/** The main checkout's copies of the files a batch owns, at its seed: path (relative) → content, absent ones left out. */
export type SeedSnapshot = ReadonlyMap<string, string>;

/** The most files a seed copies: past it, the seed is refused rather than half done. */
export const SEED_MAX_FILES = 2000;
const LIST_CAP = 1000;
const WORKSPACE = "/workspace";

const reasonOf = (e: unknown): string => String((e as Error)?.message ?? e).split("\n")[0];

function sources(target: SeedTarget): string[] {
  return [
    `${target.work}/${target.code}`, `.orkeon/dev/${target.code}`, ".orkeon/config.json", ".orkeon/repo.yaml",
    ".claude/settings.local.json", ".claude/harness/packs", target.memoryDir,
  ];
}

/** True for a file of the batch (relative path): its sheet and verdict, its capture, its logs, its implement record. */
export function ownedBy(target: Pick<SeedTarget, "work" | "code" | "batch">, path: string): boolean {
  const folder = `${target.work}/${target.code}/`;
  if (path === `.orkeon/dev/${target.code}/implement-${target.batch}.json`) return true;
  if (!path.startsWith(folder)) return false;
  const rest = path.slice(folder.length);
  return (!rest.includes("/") && rest.endsWith(`-${target.batch}.md`))
    || rest.startsWith(`capture-${target.batch}/`)
    || (rest.startsWith("logs/") && !rest.slice(5).includes("/") && rest.slice(5).startsWith(`${target.batch}-`));
}

/** Every file under `base/path` (a file, or a folder walked), relative to `base`, with its content; absent: none. */
async function walk(files: Pick<Files, "read" | "list">, base: string, path: string, out: Map<string, string>): Promise<void> {
  if (out.size > SEED_MAX_FILES) return;
  const full = `${base}/${path}`;
  try {
    out.set(path, await files.read(full));
    return;
  } catch {
    // Not a readable file: a folder, or nothing.
  }
  let names: string[];
  try {
    names = await files.list(full, LIST_CAP);
  } catch {
    return;
  }
  for (const raw of names) {
    const name = raw.replace(/\/+$/, "").split("/").pop() ?? "";
    if (name === "" || name === "." || name === "..") continue;
    await walk(files, base, `${path}/${name}`, out);
  }
}

function unsafe(target: SeedTarget): string | null {
  const relative = (p: string) => p !== "" && !p.startsWith("/") && !p.split("/").includes("..");
  if (!relative(target.work)) return `the work folder '${target.work}' is not a folder of the checkout`;
  if (!relative(target.memoryDir)) return `memory.dir '${target.memoryDir}' is not a folder of the checkout`;
  if (!isCode(target.code)) return `'${target.code}' is not a work code`;
  return null;
}

async function readOrNull(files: Pick<Files, "read">, path: string): Promise<string | null> {
  try {
    return await files.read(path);
  } catch {
    return null;
  }
}

/**
 * Seeds the worktree from the main checkout; `fresh`: just made, every file written over the committed copy git
 * gave it. Answers the snapshot the harvest compares with, or the line saying why it was not seeded.
 */
export async function seedWorktree(
  files: Pick<Files, "read" | "write" | "list">, target: SeedTarget, fresh: boolean,
): Promise<{ ok: true; snapshot: SeedSnapshot } | { ok: false; line: string }> {
  const refused = unsafe(target);
  if (refused !== null) return { ok: false, line: `${target.place.path} not seeded: ${refused}` };
  const found = new Map<string, string>();
  for (const source of sources(target)) await walk(files, WORKSPACE, source, found);
  if (found.size > SEED_MAX_FILES) {
    return { ok: false, line: `${target.place.path} not seeded: more than ${SEED_MAX_FILES} files to copy (the work folder, .orkeon/dev, the packs, memory.dir)` };
  }
  const snapshot = new Map<string, string>();
  try {
    for (const [path, content] of found) {
      const owned = ownedBy(target, path);
      if (owned) snapshot.set(path, content);
      const to = `${target.place.root}/${path}`;
      // A reused worktree keeps what its batch wrote: its ticks, its verdict, its capture.
      if (!fresh && owned && await readOrNull(files, to) !== null) continue;
      await files.write(to, content);
    }
  } catch (e) {
    return { ok: false, line: `${target.place.path} not seeded: ${reasonOf(e)}` };
  }
  return { ok: true, snapshot };
}

/**
 * Brings back what the batch changed of its own files, against `snapshot` (none: the main checkout as it is). A file
 * the main checkout changed since the seed is left as it is there and named; any other failure is a warning line too,
 * the batch's commit being what counts.
 */
export async function harvestBatch(
  files: Pick<Files, "read" | "write" | "list">, target: SeedTarget, snapshot?: SeedSnapshot,
): Promise<{ ok: true; brought: string[] } | { ok: false; brought: string[]; line: string }> {
  const brought: string[] = [];
  const refused = unsafe(target);
  if (refused !== null) return { ok: false, brought, line: `⚠ ${target.batch}'s files not brought back from ${target.place.path}: ${refused}` };
  const found = new Map<string, string>();
  for (const source of [`${target.work}/${target.code}`, `.orkeon/dev/${target.code}`]) await walk(files, target.place.root, source, found);
  const kept: string[] = [];
  try {
    for (const [path, content] of found) {
      if (!ownedBy(target, path)) continue;
      const main = await readOrNull(files, `${WORKSPACE}/${path}`);
      const seeded = snapshot === undefined ? main : snapshot.get(path) ?? null;
      if (content === seeded || content === main) continue;
      if (main !== seeded) {
        kept.push(path);
        continue;
      }
      await files.write(`${WORKSPACE}/${path}`, content);
      brought.push(path);
    }
  } catch (e) {
    return { ok: false, brought, line: `⚠ ${target.batch}'s files not brought back from ${target.place.path}: ${reasonOf(e)}` };
  }
  if (kept.length > 0) {
    return {
      ok: false, brought,
      line: `⚠ ${target.batch}: ${kept.join(", ")} changed in the checkout since the seed: kept as they are, the batch's copies left in ${target.place.path}`,
    };
  }
  return { ok: true, brought };
}

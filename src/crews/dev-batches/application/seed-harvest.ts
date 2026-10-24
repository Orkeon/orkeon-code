// The files a batch's worktree needs and does not get from git, and the ones it writes back. The driver of a
// parallel /dev-batches, only writer of the main checkout, seeds the worktree before the batch agent is built - the
// work code's folder (plan, sheets, verdicts), its dev state, the config, the session's settings, the packs and the
// shared memory, none of them tracked in every repository - and harvests the batch's own files once it settles: the
// names carry its batch (sheet, verdict, capture-F<n>/, implement-F<n>.json) and the logs; the plan never comes back,
// a batch's done being read from its sheet (L7-D3). Both copy with `cp -Ru`: a file is replaced only by a newer
// one, so a resumed batch keeps its ticks and a merge's own checkout is never overwritten. A named work folder the
// worktree lacks (a submodule not checked out there) is created, so that the batch resolves it as applied.
import type { Shell } from "../../../shared/application/ports.ts";
import { gitReason } from "../../../shared/application/git/commit-files.ts";
import { isCode } from "../../../shared/domain/dev/artefacts.ts";
import { shellQuote, shellUnsafe } from "../../../shared/domain/git/close.ts";
import type { WorktreePlace } from "../../../shared/domain/git/worktree.ts";

export interface SeedTarget {
  place: WorktreePlace;
  /** The work folder, relative to the checkout ("todo", "backstage/tasks"). */
  work: string;
  code: string;
  /** memory.dir, relative to the checkout. */
  memoryDir: string;
}

const parentOf = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const inside = (folder: string, path: string): string => (path === "" ? folder : `${folder}/${path}`);

/** `source` copied to the same place under `to`, when it exists; never over a newer file. */
function copyLine(source: string, to: string): string {
  const parent = inside(to, parentOf(source));
  return `{ [ ! -e ${shellQuote(source)} ] || { mkdir -p ${shellQuote(parent)} && cp -Ru ${shellQuote(source)} ${shellQuote(`${parent}/`)}; }; }`;
}

/** The one shell line that seeds the worktree from the main checkout. */
export function seedCommand(target: SeedTarget): string {
  const to = target.place.path;
  const sources = [
    `${target.work}/${target.code}`, `.orkeon/dev/${target.code}`, ".orkeon/config.json", ".orkeon/repo.yaml",
    ".claude/settings.local.json", ".claude/harness/packs", target.memoryDir,
  ];
  return [`mkdir -p ${shellQuote(`${to}/${target.work}`)}`, ...sources.map((s) => copyLine(s, to))].join(" && ");
}

/** The one shell line that brings the batch's own files back from its worktree. */
export function harvestCommand(target: SeedTarget & { batch: string }): string {
  const from = target.place.path;
  const folder = `${target.work}/${target.code}`;
  const back = (path: string): string => {
    const parent = parentOf(path);
    return `{ [ ! -e ${shellQuote(`${from}/${path}`)} ] || { mkdir -p ${shellQuote(parent)} && cp -Ru ${shellQuote(`${from}/${path}`)} ${shellQuote(`${parent}/`)}; }; }`;
  };
  return [
    `for f in ${shellQuote(`${from}/${folder}/`)}*-${target.batch}.md; do [ ! -e "$f" ] || cp -Ru "$f" ${shellQuote(`${folder}/`)}; done`,
    back(`${folder}/capture-${target.batch}`),
    back(`${folder}/logs`),
    back(`.orkeon/dev/${target.code}/implement-${target.batch}.json`),
  ].join(" && ");
}

function unsafe(target: SeedTarget): string | null {
  const relative = (p: string) => p !== "" && !p.startsWith("/") && !p.split("/").includes("..") && !shellUnsafe(p);
  if (!relative(target.work)) return `the work folder '${target.work}' is not a folder of the checkout`;
  if (!relative(target.memoryDir)) return `memory.dir '${target.memoryDir}' is not a folder of the checkout`;
  if (!isCode(target.code) || shellUnsafe(target.code)) return `'${target.code}' is not a work code`;
  return null;
}

/** Seeds the worktree; the line saying why it was not. */
export async function seedWorktree(shell: Pick<Shell, "run">, target: SeedTarget): Promise<{ ok: true } | { ok: false; line: string }> {
  const refused = unsafe(target);
  if (refused !== null) return { ok: false, line: `${target.place.path} not seeded: ${refused}` };
  const out = await run(shell, seedCommand(target));
  return out === null ? { ok: true } : { ok: false, line: `${target.place.path} not seeded: ${out}` };
}

/** Brings the batch's files back; a failure is a warning line, the batch's commit being what counts. */
export async function harvestBatch(
  shell: Pick<Shell, "run">, target: SeedTarget & { batch: string },
): Promise<{ ok: true } | { ok: false; line: string }> {
  const refused = unsafe(target);
  const out = refused ?? await run(shell, harvestCommand(target));
  return out === null ? { ok: true } : { ok: false, line: `⚠ ${target.batch}'s files not brought back from ${target.place.path}: ${out}` };
}

/** The failure's first line; null when the command succeeded. */
async function run(shell: Pick<Shell, "run">, command: string): Promise<string | null> {
  try {
    const r = await shell.run(command);
    return r.exitCode === 0 ? null : gitReason(r);
  } catch (e) {
    return String((e as Error)?.message ?? e).split("\n")[0];
  }
}

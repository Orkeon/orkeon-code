// The batch sheet the command names: by its code (`<work>/<code>/<CODE>-PLAN-F<n>.md`), by the path
// of its global plan (the sheet beside it), or, with neither, the one sheet of that batch under the
// work folder. Paths are relative to /workspace.
import type { Files } from "../../../shared/application/ports.ts";
import { classifyArtefact, isCode } from "../../../shared/domain/dev/artefacts.ts";

export const WORKSPACE = "/workspace";
const ENTRIES_PROBED = 50;
const LIST_CAP = 500;

export interface LocatedSheet {
  /** Folder of the plan, relative to /workspace, e.g. `workbench/prune`. */
  dir: string;
  name: string;
  prefix: string;
  /** The code: the plan folder's own name. */
  code: string;
}

const bare = (entry: string): string => entry.replace(/\/+$/, "");
const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

async function listOrEmpty(files: Pick<Files, "list">, path: string): Promise<string[]> {
  try {
    return (await files.list(path, LIST_CAP)).map(bare).sort(byName);
  } catch {
    return [];
  }
}

function located(dir: string, name: string, prefix: string): LocatedSheet {
  return { dir, name, prefix, code: dir.slice(dir.lastIndexOf("/") + 1) };
}

async function sheetsIn(files: Pick<Files, "list">, dir: string, batch: string): Promise<LocatedSheet[]> {
  const out: LocatedSheet[] = [];
  for (const name of await listOrEmpty(files, `${WORKSPACE}/${dir}`)) {
    const a = classifyArtefact(name);
    if (a !== null && a.kind === "sheet" && a.batch === batch) out.push(located(dir, name, a.prefix));
  }
  return out;
}

function several(batch: string, sheets: readonly LocatedSheet[]): string {
  return `several sheets for ${batch}: ${sheets.map((s) => `${s.dir}/${s.name}`).join(", ")}: name the plan, e.g. /dev-implement ${batch} <code>`;
}

/** The sheet, or why none is found. */
export async function locateSheet(
  files: Pick<Files, "read" | "list">, work: string, batch: string, plan: string | null,
): Promise<LocatedSheet | string> {
  if (plan === null) {
    const found: LocatedSheet[] = [];
    for (const entry of (await listOrEmpty(files, `${WORKSPACE}/${work}`)).slice(0, ENTRIES_PROBED)) {
      found.push(...(await sheetsIn(files, `${work}/${entry}`, batch)));
    }
    if (found.length === 0) return `no ${work}/*/*-PLAN-${batch}.md: name the plan, e.g. /dev-implement ${batch} <code>`;
    return found.length === 1 ? found[0] : several(batch, found);
  }
  if (isCode(plan)) {
    const found = await sheetsIn(files, `${work}/${plan}`, batch);
    if (found.length === 0) return `${work}/${plan}/ holds no *-PLAN-${batch}.md`;
    if (found.length === 1) return found[0];
    const named = found.filter((s) => s.prefix === plan.toUpperCase());
    return named.length === 1 ? named[0] : several(batch, found);
  }
  const neither = `'${plan}' is neither a code nor a <CODE>-PLAN.md path`;
  const relative = plan.startsWith(`${WORKSPACE}/`) ? plan.slice(WORKSPACE.length + 1) : plan;
  const slash = relative.lastIndexOf("/");
  if (relative.startsWith("/") || relative.split("/").includes("..") || slash <= 0) return neither;
  const classified = classifyArtefact(relative.slice(slash + 1));
  if (classified === null || classified.kind !== "plan") return neither;
  const sheet = located(relative.slice(0, slash), `${classified.prefix}-PLAN-${batch}.md`, classified.prefix);
  try {
    await files.read(`${WORKSPACE}/${sheet.dir}/${sheet.name}`, 1);
  } catch {
    return `no ${sheet.dir}/${sheet.name} beside ${relative}`;
  }
  return sheet;
}

// The anchors of a checked plan answer against the repository: a path given as existing
// must be there, a path given as a file to create must not be. One listing per folder and
// per run (40 folders at most, the cache shared by the two attempts of a run); it reads
// listings only and writes nothing. Past the cap an existing anchor is refused as not
// checked, never let through. Its problems join the answer's, for the one re-ask.
import type { Files } from "../../../shared/application/ports.ts";
import type { AnchorRef, PlanAnswer } from "../domain/plan-answer.ts";

export const MAX_ANCHOR_FOLDERS = 40;

/** The folders listed in one run, relative to /workspace ("" for the top), with the names they hold. */
export type AnchorListings = Map<string, ReadonlySet<string>>;

const WORKSPACE = "/workspace";
const LIST_CAP = 1000;

const folderOf = (path: string): string => {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
};
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/**
 * `Bk Sj: <path> does not exist` / `Bk Sj: <path> exists: …` / `Bk Sj: anchor "<path>" not checked: …`,
 * each once, in plan order. `listings` carries the folders already listed in this run, and gains the new ones.
 */
export async function checkAnchorPaths(
  files: Pick<Files, "list">, answer: PlanAnswer, listings: AnchorListings = new Map(),
): Promise<string[]> {
  const listing = async (folder: string): Promise<ReadonlySet<string> | null> => {
    const known = listings.get(folder);
    if (known !== undefined) return known;
    if (listings.size >= MAX_ANCHOR_FOLDERS) return null;
    let names: string[];
    try {
      names = await files.list(folder === "" ? WORKSPACE : `${WORKSPACE}/${folder}`, LIST_CAP);
    } catch {
      names = [];
    }
    const set = new Set(names.map((n) => n.replace(/\/+$/, "")));
    listings.set(folder, set);
    return set;
  };
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [k, batch] of answer.batches.entries()) {
    for (const [j, step] of batch.steps.entries()) {
      const anchors: AnchorRef[] = [...step.anchors.tests, ...step.anchors.doubles, ...step.anchors.production];
      for (const a of anchors) {
        if ((a.kind !== "create" && a.kind !== "existing") || a.path === undefined) continue;
        const path = a.path.replace(/^\.\//, "");
        const at = `B${k + 1} S${j + 1}`;
        let problem: string | null = null;
        if (path.includes(":")) {
          problem = `${at}: anchor path "${path}" holds ":"`;
        } else {
          const names = await listing(folderOf(path));
          if (names === null) {
            if (a.kind === "existing") problem = `${at}: anchor "${path}" not checked: more than ${MAX_ANCHOR_FOLDERS} folders`;
          } else {
            const present = names.has(nameOf(path));
            if (a.kind === "existing" && !present) problem = `${at}: ${path} does not exist`;
            if (a.kind === "create" && present) problem = `${at}: ${path} exists: anchor it as existing, or by its ref`;
          }
        }
        if (problem !== null && !seen.has(problem)) { seen.add(problem); problems.push(problem); }
      }
    }
  }
  return problems;
}

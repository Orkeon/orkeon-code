// The anchors of a checked plan answer against the repository: a path given as existing
// must be there, a path given as a file to create must not be. One listing per folder and
// per run (40 folders at most, the cache shared by the two attempts of a run); it reads
// listings only and writes nothing. Past the cap, or in a folder whose listing the entry cap
// cut short, an existing anchor it cannot see is refused as not checked, never let through. Its problems join the answer's, for the one re-ask.
import type { Files } from "../../../shared/application/ports.ts";
import { stepLabel } from "../domain/plan-answer.ts";
import type { AnchorRef, PlanAnswer } from "../domain/plan-answer.ts";
import { anchorKindSetRight, anchorPathColon, doesNotExist, existsAnchorIt, notCheckedEntries, notCheckedFolders } from "../domain/messages.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

export const MAX_ANCHOR_FOLDERS = 40;

/** The folders listed in one run, relative to /workspace ("" for the top), with the names they hold. */
export type AnchorListings = Map<string, ReadonlySet<string>>;

export const LIST_CAP = 1000;

const folderOf = (path: string): string => {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
};
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** The names of `folder`, listed once per run; null past MAX_ANCHOR_FOLDERS folders. A listing that throws is empty. */
async function listingOf(files: Pick<Files, "list">, listings: AnchorListings, folder: string): Promise<ReadonlySet<string> | null> {
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
}

/**
 * The anchor kind code knows better than the model, set right in `answer` instead of costing a second call: a test
 * or double file given as existing that a whole listing does not hold becomes a file to create. A production file
 * given as existing and absent stays for checkAnchorPaths to refuse (the step meant to change code that is not
 * there), as does a file to create that exists (the plan did not see it). Returns one line per anchor set right.
 */
export async function repairAnchorKinds(
  files: Pick<Files, "list">, answer: PlanAnswer, listings: AnchorListings = new Map(),
): Promise<string[]> {
  const repaired: string[] = [];
  for (const batch of answer.batches) {
    for (const step of batch.steps) {
      const anchors: Array<[AnchorRef, boolean]> = [
        ...step.anchors.tests.map((a): [AnchorRef, boolean] => [a, true]),
        ...step.anchors.doubles.map((a): [AnchorRef, boolean] => [a, true]),
        ...step.anchors.production.map((a): [AnchorRef, boolean] => [a, false]),
      ];
      for (const [a, testSide] of anchors) {
        if (!testSide || a.kind !== "existing" || a.path === undefined) continue;
        const path = a.path.replace(/^\.\//, "");
        if (path.includes(":")) continue;
        const names = await listingOf(files, listings, folderOf(path));
        if (names === null) continue;
        if (a.kind === "existing" && !names.has(nameOf(path)) && names.size < LIST_CAP) {
          a.kind = "create";
          repaired.push(anchorKindSetRight(path));
        }
      }
    }
  }
  return [...new Set(repaired)];
}

/**
 * `<step>: <path> does not exist` / `<step>: <path> exists: …` / `<step>: anchor "<path>" not checked: …`, the step
 * labelled as the answer check labels it (`F1 "<name>" S2 "<title>"`),
 * each once, in plan order. `listings` carries the folders already listed in this run, and gains the new ones.
 */
export async function checkAnchorPaths(
  files: Pick<Files, "list">, answer: PlanAnswer, listings: AnchorListings = new Map(),
): Promise<string[]> {
  const listing = (folder: string) => listingOf(files, listings, folder);
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [k, batch] of answer.batches.entries()) {
    for (const [j, step] of batch.steps.entries()) {
      const anchors: AnchorRef[] = [...step.anchors.tests, ...step.anchors.doubles, ...step.anchors.production];
      for (const a of anchors) {
        if ((a.kind !== "create" && a.kind !== "existing") || a.path === undefined) continue;
        const path = a.path.replace(/^\.\//, "");
        const at = stepLabel(batch, k, j);
        let problem: string | null = null;
        if (path.includes(":")) {
          problem = anchorPathColon(at, path);
        } else {
          const names = await listing(folderOf(path));
          if (names === null) {
            if (a.kind === "existing") problem = notCheckedFolders(at, path, MAX_ANCHOR_FOLDERS);
          } else {
            const present = names.has(nameOf(path));
            // A listing the cap cut short may leave the name out: that is no proof it is absent.
            if (a.kind === "existing" && !present && names.size >= LIST_CAP) {
              problem = notCheckedEntries(at, path, LIST_CAP);
            } else if (a.kind === "existing" && !present) problem = doesNotExist(at, path);
            if (a.kind === "create" && present) problem = existsAnchorIt(at, path);
          }
        }
        if (problem !== null && !seen.has(problem)) { seen.add(problem); problems.push(problem); }
      }
    }
  }
  return problems;
}

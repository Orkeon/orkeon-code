// The access cost of a batch, or of one /dev-implement cycle: the changed files under the cost roots,
// refreshed in the code index, then measured by `access_cost` (/dev-verify's capture, /dev-implement's COST). The index is a precondition, never built here: without
// a /workspace root the cost is "not indexed" (the tool would answer an empty report). A call
// that fails leaves the cost not computed; nothing here refuses the step.
import type { CostIndex } from "../ports.ts";
import type { AccessCost } from "../../domain/dev/access-cost.ts";
import {
  COST_NOT_WIRED, INDEX_ROOT, isTestFile, isTestRoot, measuredCost, notComputed, notIndexed, nothingChanged,
  receiversArgument, underRoots,
} from "../../domain/dev/access-cost.ts";
import type { RepoPack } from "../../domain/dev/repo-pack.ts";

const firstLine = (text: string): string => (text.split("\n")[0] ?? "").trim();

/** A changed file outside the plan folder, and the lines its captured diff adds (null: not known). */
export interface CostFile { path: string; added: Set<number> | null }

/** `tools.access_cost.roots`, else none: every changed file that is not a test. */
export function costRoots(pack: RepoPack | null): string[] {
  return [...(pack?.accessCost.roots ?? [])];
}

function failed(tool: string, error: unknown): AccessCost {
  return notComputed(`${tool} failed (${firstLine(error instanceof Error ? error.message : String(error))}); judge the Cost axis from the diff`);
}

function normalRoot(root: string): string {
  return root.length > 1 ? root.replace(/\/+$/, "") : root;
}

export async function measureAccessCost(
  index: CostIndex | undefined, pack: RepoPack | null, gateRoots: readonly string[], changed: readonly CostFile[],
  isTest?: (path: string) => boolean,
): Promise<AccessCost> {
  if (index === undefined) return COST_NOT_WIRED;
  const roots = costRoots(pack);
  const testRoots = gateRoots.filter(isTestRoot);
  // A caller that knows the pack's test paths says which they are; else a path that says test is one (AC:326-331).
  const test = isTest ?? ((p: string) => isTestFile(p, testRoots));
  const kept = underRoots(changed.map((f) => f.path).filter((p) => !test(p)), roots);
  if (kept.length === 0) return nothingChanged(roots);
  const files = kept.map((p) => `${INDEX_ROOT}/${p}`);

  let indexed: string[];
  try {
    indexed = await index.roots();
  } catch (error) {
    return failed("index_status", error);
  }
  if (!indexed.map(normalRoot).includes(INDEX_ROOT)) return notIndexed(indexed);

  try {
    const errors = await index.refresh(INDEX_ROOT, files);
    if (errors.length > 0) return notComputed(`incremental_reindex: ${firstLine(errors[0])}; judge the Cost axis from the diff`);
  } catch (error) {
    return failed("incremental_reindex", error);
  }

  let answer: Awaited<ReturnType<CostIndex["accessCost"]>>;
  try {
    answer = await index.accessCost(files, receiversArgument(pack?.accessCost.receivers));
  } catch (error) {
    return failed("access_cost", error);
  }
  if (answer.errors.length > 0) return notComputed(`access_cost: ${firstLine(answer.errors[0])}; judge the Cost axis from the diff`);
  if (answer.report === null) return notComputed("access_cost returned no readable report; judge the Cost axis from the diff");

  const added = new Map(changed.map((f) => [`${INDEX_ROOT}/${f.path}`, f.added] as const));
  return measuredCost(answer.report, added);
}

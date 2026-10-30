// /analyze use case — the deterministic harvest of the code index, then (unless
// `raw`) ONE synthesis call. No tool choice is left to the model: this chains
// index → maps → dependency_graph → package summaries itself (the guarantee
// "analyze the codebase" always hits the RaggableTree), ../domain/harvest renders
// the harvest, and the synthesis agent has NO tools, so the model can only read
// the harvest, never wander off into grep.

import type { CodeIndex, Llm, Logger, Progress } from "../../../shared/application/ports.ts";
import type { IndexSummary, PackageSummary } from "../../../shared/domain/code-intel-contract.ts";
import { renderHarvest, SYNTHESIS_SYSTEM, buildSynthesisUser } from "../domain/harvest.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** Packages summarized in the harvest — beyond this a repo needs a narrower ask. */
export const MAX_PACKAGES = 10;

/** Status-line headline of the /analyze progress. */
export const PROGRESS_LABEL = "Analyzing codebase";
const PROGRESS_TOTAL = 5;
const phase = (step: number, message: string) =>
  ({ label: PROGRESS_LABEL, step, total: PROGRESS_TOTAL, message });

/** The crew's input: `raw` (true or "true") returns the harvest without the synthesis; `parallel`, a whole
 *  number of at least 1, is how many files the indexing parses at once — anything else leaves the runtime's
 *  default; `rebuild` (true or "true") indexes again from scratch, past the session's index and the saved one. */
export interface AnalyzeInputs {
  raw?: unknown;
  parallel?: unknown;
  rebuild?: unknown;
}

function readParallel(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** What the index cache did, for the indexing line: empty on a runtime without the cache (before Orkeon #244). */
function cacheNote(idx: IndexSummary): string {
  switch (idx.cache) {
    case undefined: return "";
    case "hit": return "; cache hit: the index an earlier session saved, no file changed";
    case "refreshed": return `; cache refreshed: ${idx.reindexed ?? 0} changed file(s) reindexed`;
    case "miss": return "; cache miss: built, then saved";
    case "bypassed": return "; cache bypassed: rebuilt, then saved";
    default: return `; cache ${idx.cache}`;
  }
}

export interface AnalyzeDeps {
  index: CodeIndex;
  progress: Progress;
  llm: Pick<Llm, "act">;
  log: Logger;
}

export async function runAnalyze(input: AnalyzeInputs, deps: AnalyzeDeps): Promise<string> {
  const { index, progress, llm, log } = deps;
  const raw = input.raw === true || String(input.raw ?? "") === "true";
  const parallel = readParallel(input.parallel);
  const rebuild = input.rebuild === true || String(input.rebuild ?? "") === "true";
  try {
    // 1. Ensure an index exists. The store is process-lifetime, so within a REPL
    //    session the first /analyze pays the build and the next ones reuse it
    //    (the read tools keep it fresh lazily — no re-run after edits); the
    //    runtime reloads the index an earlier session saved. `rebuild` skips both.
    await progress.report(phase(1, "indexing"));
    if (rebuild || (await index.rootCount()) === 0) {
      const opts = { ...(parallel === undefined ? {} : { parallel }), ...(rebuild ? { rebuild } : {}) };
      const idx = await index.index(WORKSPACE, Object.keys(opts).length === 0 ? undefined : opts);
      if (idx.files === 0) {
        return `analyze: indexed 0 file(s) under ${WORKSPACE} — nothing to analyze ` +
               "(no file matches the Tree-sitter adapters' extensions).";
      }
      log.info(`analyze: indexed ${idx.files} file(s), ${idx.nodes} node(s)${cacheNote(idx)}`);
    }

    // 2. The deterministic harvest — maps, module graph, package summaries.
    await progress.report(phase(2, "mapping the codebase"));
    const l1 = await index.map("L1_Package", false);
    const l3 = await index.map("L3_Symbol", true);
    await progress.report(phase(3, "walking module dependencies"));
    const moduleGraph = await index.dependencyGraph("L2_Module", 200);
    await progress.report(phase(4, "summarizing packages"));
    const packages: PackageSummary[] = [];
    for (const p of l1.entries.slice(0, MAX_PACKAGES)) {
      packages.push(await index.packageSummary(p.fqn));
    }
    if (l1.entries.length > MAX_PACKAGES) {
      log.warn(`analyze: ${l1.entries.length - MAX_PACKAGES} package(s) beyond the cap of ${MAX_PACKAGES} not summarized`);
    }

    const harvest = renderHarvest({
      packages,
      moduleGraph,
      symbols: l3.entries,
      symbolCount: l3.symbolCount,
    });
    if (raw) return harvest;

    // 3. ONE synthesis call. maxIterations 1 is safe: with an empty catalogue the
    //    model has no tool schemas, so the turn can only be a completion.
    await progress.report(phase(5, "synthesizing"));
    return await llm.act(buildSynthesisUser(harvest), {
      system: SYNTHESIS_SYSTEM,
      maxIterations: 1,
    });
  } finally {
    await progress.done(PROGRESS_LABEL);
  }
}

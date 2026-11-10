// /analyze use case — the deterministic harvest of the code index, then (unless
// `raw`) ONE synthesis call. No tool choice is left to the model: this chains
// index → package map → dependency_graph → package summaries itself (the guarantee
// "analyze the codebase" always hits the RaggableTree), ../domain/harvest renders
// the harvest, and the synthesis agent has NO tools, so the model can only read
// the harvest, never wander off into grep.

import type { CodeIndex, Llm, Logger, Progress } from "../../../shared/application/ports.ts";
import { indexCacheNote, type PackageSummary } from "../../../shared/domain/code-intel-contract.ts";
import {
  rankPackages, renderHarvest, selectPackages, buildSynthesisUser,
} from "../domain/harvest.ts";
import { SYNTHESIS_SYSTEM } from "../domain/prompts.ts";
import {
  indexed, nothingIndexed, packagesNotRead, packagesNotSummarized, parallelIgnored, PHASE_INDEXING, PHASE_MAPPING,
  PHASE_SUMMARIZING, PHASE_SYNTHESIZING, PHASE_WALKING, PROGRESS_LABEL,
} from "./messages.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** Packages summarized in the harvest, the entry packages and the largest — beyond this a repo needs a narrower ask. */
export const MAX_PACKAGES = 15;
/** Packages read for their dependencies and entry points, the largest first: one package_summary each. */
export const MAX_SCANNED_PACKAGES = 200;
/** Packages the L1 map is asked for: the tool returns 200 by default, in the store's order. */
export const MAX_MAP_ENTRIES = 1000;
/** Modules of the L2 graph: the whole graph of a large repository exceeds the script's memory budget. */
export const GRAPH_NODES = 200;

const PROGRESS_TOTAL = 5;
const phase = (step: number, message: string) =>
  ({ label: PROGRESS_LABEL, step, total: PROGRESS_TOTAL, message });

/** The crew's input: `raw` (true or "true") returns the harvest without the synthesis; `parallel`, a whole
 *  number of at least 1, is how many files the indexing parses at once — anything else leaves the runtime's
 *  default, with a warning; `rebuild` (true or "true") indexes again from scratch, past the session's index and the saved one;
 *  `language`, a non-empty text (the session's `answer.language`), is the language the synthesis is written in. */
export interface AnalyzeInputs {
  raw?: unknown;
  parallel?: unknown;
  rebuild?: unknown;
  language?: unknown;
}

function readParallel(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : undefined;
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
    await progress.report(phase(1, PHASE_INDEXING));
    if (rebuild || (await index.rootCount()) === 0) {
      if (parallel === undefined && input.parallel !== undefined && input.parallel !== "") {
        log.warn(parallelIgnored(String(input.parallel)));
      }
      const opts = { ...(parallel === undefined ? {} : { parallel }), ...(rebuild ? { rebuild } : {}) };
      const idx = await index.index(WORKSPACE, Object.keys(opts).length === 0 ? undefined : opts);
      if (idx.files === 0) {
        return nothingIndexed(WORKSPACE);
      }
      const note = indexCacheNote(idx);
      log.info(indexed(idx.files, idx.nodes, note));
    }

    // 2. The deterministic harvest — the package map, module graph, package summaries. The symbols come
    //    from the summaries' public exports: the L3 map lists the store's first nodes, whatever they are.
    await progress.report(phase(2, PHASE_MAPPING));
    const ranked = rankPackages((await index.map("L1_Package", false, MAX_MAP_ENTRIES)).entries);
    await progress.report(phase(3, PHASE_WALKING));
    const moduleGraph = await index.dependencyGraph("L2_Module", GRAPH_NODES);
    await progress.report(phase(4, PHASE_SUMMARIZING));
    const scanned: PackageSummary[] = [];
    for (const p of ranked.slice(0, MAX_SCANNED_PACKAGES)) {
      scanned.push(await index.packageSummary(p.fqn));
    }
    if (ranked.length > MAX_SCANNED_PACKAGES) {
      log.warn(packagesNotRead(ranked.length - MAX_SCANNED_PACKAGES, MAX_SCANNED_PACKAGES));
    }
    if (ranked.length > MAX_PACKAGES) {
      log.warn(packagesNotSummarized(ranked.length - MAX_PACKAGES, MAX_PACKAGES));
    }
    const selected = new Set(selectPackages(ranked, scanned, MAX_PACKAGES));

    const harvest = renderHarvest({
      packages: scanned.filter((p) => selected.has(p.fqn)),
      unsummarized: ranked.filter((p) => !selected.has(p.fqn)),
      scanned,
      moduleGraph,
      graphCap: GRAPH_NODES,
      mapCap: MAX_MAP_ENTRIES,
    });
    if (raw) return harvest;

    // 3. ONE synthesis call. maxIterations 1 is safe: with an empty catalogue the
    //    model has no tool schemas, so the turn can only be a completion.
    await progress.report(phase(5, PHASE_SYNTHESIZING));
    const language = typeof input.language === "string" && input.language.trim() !== "" ? input.language.trim() : undefined;
    return await llm.act(buildSynthesisUser(harvest, language), {
      system: SYNTHESIS_SYSTEM,
      maxIterations: 1,
    });
  } finally {
    await progress.done(PROGRESS_LABEL);
  }
}

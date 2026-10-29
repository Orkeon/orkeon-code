// CodeIndex adapter over index_status, index_codebase, codebase_map,
// dependency_graph, package_summary, codebase_search, symbol_source and
// impact_analysis. The payloads are read once, here,
// through the readers of shared/domain/code-intel-contract.ts, which pin the
// field names of the live tools. The AnchorIndex adapter over batch_anchors
// reads its result through tool-results.ts; the CostIndex adapter over
// index_status, incremental_reindex and access_cost reads the report through
// shared/domain/dev/access-cost.ts, and asks affected_tests when the host has it.

import type { AnchorIndex, CodeIndex, CostIndex } from "../../application/ports.ts";
import { readAccessCostReport } from "../../domain/dev/access-cost.ts";
import { INDEXED_LANGUAGES } from "../../domain/index-languages.ts";
import type { BatchAnchorsClosureInput } from "./runtime-tools.ts";
import { asArray, pick } from "./tool-results.ts";
import {
  readGraph, readImpact, readIndexSummary, readMapEntries, readMapSymbolCount, readPackageSummary,
  readSearchHitsWithOrigin, readSymbolLocation,
} from "../../domain/code-intel-contract.ts";

type CodeIndexTools = "indexStatus" | "indexCodebase" | "codebaseMap" | "dependencyGraph" | "packageSummary"
  | "codebaseSearch" | "symbolSource" | "impactAnalysis";

/** Lines of source `symbol_source` returns: only the first one is kept, so the payload stays small. */
const SOURCE_LINES = 20;

export function createCodeIndex(tools: Pick<OrkeonTools, CodeIndexTools>): CodeIndex {
  return {
    async rootCount() {
      const status = (await tools.indexStatus({})) as { roots?: unknown } | null | undefined;
      return Array.isArray(status?.roots) ? status.roots.length : 0;
    },
    async index(root, opts) {
      // The languages named: every grammar of the runtime's registry (index-languages.ts); a file the runtime still
      // refuses to read is skipped by the discovery, not fatal (Orkeon #215).
      const input = { root_path: root, languages: INDEXED_LANGUAGES };
      return readIndexSummary(await tools.indexCodebase(
        opts?.parallel === undefined ? input : { ...input, max_parallelism: opts.parallel }));
    },
    async map(level, withMetrics) {
      const raw = await tools.codebaseMap(withMetrics ? { level, include_metrics: true } : { level });
      return { entries: readMapEntries(raw), symbolCount: readMapSymbolCount(raw) };
    },
    async dependencyGraph(scope, maxNodes) {
      return readGraph(await tools.dependencyGraph({ scope, max_nodes: maxNodes, include_mermaid: false }));
    },
    async packageSummary(fqn) {
      return readPackageSummary(await tools.packageSummary({ fqn }));
    },
    async search(query, topK) {
      // No `mode`: the tool's default is the hybrid search.
      return readSearchHitsWithOrigin(await tools.codebaseSearch({ query, top_k: topK }));
    },
    async symbolSource(fqn) {
      return readSymbolLocation(await tools.symbolSource({ fqn, max_lines: SOURCE_LINES }), fqn);
    },
    async impact(target, maxDepth) {
      return readImpact(await tools.impactAnalysis({ target, direction: "Backward", max_depth: maxDepth }));
    },
  };
}

/** The closure of `fqns` by batch_anchors: its nodes, the anchors it did not find, and whether it was cut. */
export function createAnchorIndex(tools: Pick<OrkeonTools, "batchAnchors">): AnchorIndex {
  return {
    async closure(fqns) {
      const input: BatchAnchorsClosureInput = { action: "closure", fqns };
      const raw = await tools.batchAnchors(input);
      return {
        nodes: asArray(pick(raw, "nodes", "Nodes")).map(String),
        unresolved: asArray(pick(raw, "unresolved", "Unresolved")).map(String),
        truncated: pick(raw, "truncated", "Truncated") === true,
      };
    },
  };
}

/** The access cost of dev-verify and dev-implement: the indexed roots, the refresh of the changed files, the
 *  report; and the tests the graph reaches from them (affected_tests), when the tools hold it. */
export function createCostIndex(
  tools: Pick<OrkeonTools, "indexStatus" | "incrementalReindex" | "accessCost"> & Partial<Pick<OrkeonTools, "affectedTests">>,
): CostIndex {
  return {
    ...(tools.affectedTests === undefined ? {} : {
      async affected(files: readonly string[]) {
        // Called on `tools`, never detached from it.
        const raw = await (tools as Pick<OrkeonTools, "affectedTests">).affectedTests({ changed_files: [...files] });
        const strings = (v: unknown): string[] => asArray(v).map(String).filter((s) => s !== "");
        return {
          all: pick(raw, "all", "All") === true,
          projects: strings(pick(raw, "test_projects", "TestProjects")),
          classes: strings(pick(raw, "test_classes", "TestClasses")),
          unresolved: strings(pick(raw, "unresolved", "Unresolved")),
        };
      },
    }),
    async roots() {
      const status = (await tools.indexStatus({})) as { roots?: unknown } | null | undefined;
      if (!Array.isArray(status?.roots)) return [];
      return status.roots
        .map((r) => (typeof r === "string" ? r : String(pick(r, "virtual_root", "VirtualRoot") ?? "")))
        .filter((r) => r !== "");
    },
    async refresh(root, files) {
      const result = await tools.incrementalReindex({ root_path: root, changed_files: [...files] });
      return asArray(pick(result, "errors", "Errors")).map(String);
    },
    async accessCost(files, receivers) {
      const raw = await tools.accessCost({ changed_files: [...files], ...(receivers === undefined ? {} : { receivers }) });
      const report = pick(raw, "report", "Report");
      return { report: report === undefined || report === null ? null : readAccessCostReport(report), errors: asArray(pick(raw, "errors", "Errors")).map(String) };
    },
  };
}

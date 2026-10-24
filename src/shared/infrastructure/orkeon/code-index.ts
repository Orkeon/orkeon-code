// CodeIndex adapter over index_status, index_codebase, codebase_map,
// dependency_graph, package_summary, codebase_search, symbol_source and
// impact_analysis. The payloads are read once, here,
// through the readers of shared/domain/code-intel-contract.ts, which pin the
// field names of the live tools. The AnchorIndex adapter over batch_anchors
// reads its result through tool-results.ts.

import type { AnchorIndex, CodeIndex } from "../../application/ports.ts";
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
    async index(root) {
      return readIndexSummary(await tools.indexCodebase({ root_path: root }));
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

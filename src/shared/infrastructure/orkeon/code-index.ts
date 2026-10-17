// CodeIndex adapter over index_status, index_codebase, codebase_map,
// dependency_graph and package_summary. The payloads are read once, here,
// through the readers of shared/domain/code-intel-contract.ts, which pin the
// field names of the live tools.

import type { CodeIndex } from "../../application/ports.ts";
import {
  readGraph, readIndexSummary, readMapEntries, readMapSymbolCount, readPackageSummary,
} from "../../domain/code-intel-contract.ts";
import type { CalledTools } from "./runtime-tools.ts";

type CodeIndexTools = "indexStatus" | "indexCodebase" | "codebaseMap" | "dependencyGraph" | "packageSummary";

export function createCodeIndex(tools: Pick<CalledTools, CodeIndexTools>): CodeIndex {
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
  };
}

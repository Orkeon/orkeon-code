// /analyze — pure rendering of the deterministic harvest, and the synthesis
// prompts. No IO: the use case reads the index through the CodeIndex port (its
// adapter applies the code-intel-contract readers) and passes the READ payloads
// here; this module only formats.
//
// The design point: the command chains index → maps → dependency_graph ITSELF,
// so "does the model pick the right tool?" never arises — the harvest is already
// in the prompt when the single synthesis call runs, and the synthesis agent has
// NO tools to call. `--raw` returns the harvest untouched (zero LLM).

import type {
  GraphSummary, MapEntry, PackageSummary,
} from "../../../shared/domain/code-intel-contract.ts";

/** Cap on the L3 symbol listing — one giant repo must not drown the synthesis. */
export const MAX_HARVEST_SYMBOLS = 200;

export interface HarvestInput {
  packages: PackageSummary[];
  /** L2 module dependency graph (readGraph of dependency_graph). */
  moduleGraph: GraphSummary;
  /** L3 symbol map entries (readMapEntries). */
  symbols: MapEntry[];
  /** totals.symbol_count from the L3 map (authoritative, survives the cap). */
  symbolCount: number;
}

/** Edge endpoints are node IDs ("/path#module@0"), not FQNs — display the path half. */
export function edgeEndpointToPath(id: string): string {
  const hash = id.indexOf("#");
  return hash > 0 ? id.slice(0, hash) : id;
}

/** Group the L3 entries by kind, preserving first-seen kind order. */
export function groupByKind(symbols: MapEntry[]): Array<{ kind: string; entries: MapEntry[] }> {
  const groups = new Map<string, MapEntry[]>();
  for (const s of symbols) {
    const kind = s.kind.length > 0 ? s.kind : "unknown";
    const bucket = groups.get(kind);
    if (bucket) bucket.push(s);
    else groups.set(kind, [s]);
  }
  return [...groups.entries()].map(([kind, entries]) => ({ kind, entries }));
}

/** The deterministic harvest, as markdown. This IS the `--raw` output. */
export function renderHarvest(h: HarvestInput): string {
  const parts: string[] = ["# Codebase analysis harvest"];

  if (h.packages.length > 0) {
    parts.push(
      "## Packages\n" +
      h.packages.map((p) =>
        `- \`${p.fqn}\` — ${p.files} file(s), ${p.symbols} symbol(s)` +
        (p.dependencies.length > 0 ? `, depends on: ${p.dependencies.join(", ")}` : ""),
      ).join("\n"),
    );
  }

  const g = h.moduleGraph;
  const graphLines = [
    `${g.nodeCount} module(s), ${g.edgeCount} dependency edge(s), ${g.cycleCount} cycle(s)` +
    (g.cycleCount > 0 ? " ⚠" : ""),
  ];
  for (const e of g.edges) {
    graphLines.push(`- ${edgeEndpointToPath(e.from)} → ${edgeEndpointToPath(e.to)}`);
  }
  parts.push("## Module dependencies (L2)\n" + graphLines.join("\n"));

  const capped = h.symbols.slice(0, MAX_HARVEST_SYMBOLS);
  const symbolSections = groupByKind(capped).map(({ kind, entries }) =>
    `### ${kind} (${entries.length})\n` + entries.map((s) => `- \`${s.fqn}\``).join("\n"),
  );
  const truncated = h.symbols.length > MAX_HARVEST_SYMBOLS
    ? `\n… ${h.symbols.length - MAX_HARVEST_SYMBOLS} more symbol(s) omitted (cap ${MAX_HARVEST_SYMBOLS}).`
    : "";
  parts.push(
    `## Symbols (L3 — ${h.symbolCount} total)\n` +
    (symbolSections.length > 0 ? symbolSections.join("\n") : "(none)") + truncated,
  );

  return parts.join("\n\n");
}

/** System prompt of the single synthesis call. The agent has no tools: the
 *  harvest is complete by construction, so tool use is not a capability it needs
 *  and "answer from the harvest only" is enforceable, not aspirational. */
export const SYNTHESIS_SYSTEM =
  "You are a software architect summarizing a codebase for a developer. " +
  "Answer ONLY from the harvest provided in the message — you have no tools and " +
  "must not invent files or symbols that are not listed. Cite symbols by their " +
  "FQN in backticks. Answer in the language of the request when one is quoted, " +
  "otherwise in the harvest's language.";

/** User body of the synthesis call: the ask, then the harvest it must use. */
export function buildSynthesisUser(harvest: string): string {
  return (
    "From the harvest below, produce a concise codebase analysis:\n" +
    "1. The business/domain objects (group the symbols that represent one concept; " +
    "name the concept, list its FQNs).\n" +
    "2. The dependencies between them (use the module edges; call out cycles as risks).\n" +
    "3. Entry points and what they orchestrate.\n\n" +
    harvest
  );
}

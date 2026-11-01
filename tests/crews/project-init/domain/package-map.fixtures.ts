// The package maps and graphs renderPackageMap is tested on.
import type { GraphSummary, MapEntry } from "../../../../src/shared/domain/code-intel-contract.ts";

/** Three packages of the checkout, the smallest first in the map's order. */
export const ENTRIES: MapEntry[] = [
  { fqn: "/workspace::Util", name: "Util", kind: "package", children: 1 },
  { fqn: "/workspace::Core", name: "Core", kind: "package", children: 9 },
  { fqn: "/workspace::Api", name: "Api", kind: "package", children: 4 },
];

/** Api depends on Core and Util, Core on Util; the edges name node ids. */
export function packageGraph(): GraphSummary {
  return {
    nodes: ENTRIES.map((e) => ({ fqn: e.fqn, name: e.name, kind: e.kind })),
    edges: [
      { from: "/workspace::Api#package@0", to: "/workspace::Core#package@0", kind: "imports" },
      { from: "/workspace::Api#package@0", to: "/workspace::Util#package@0", kind: "imports" },
      { from: "/workspace::Core#package@0", to: "/workspace::Util#package@0", kind: "imports" },
    ],
    nodeCount: 3, edgeCount: 3, cycleCount: 0, cycles: [], cyclesTruncated: false,
  };
}

/** The map of ENTRIES over packageGraph(). */
export const RENDERED = [
  "3 package(s), each with the packages it depends on:",
  "- Core ← depends on Util",
  "- Api ← depends on Core, Util",
  "- Util",
].join("\n");

/** `count` packages with long names and no edge. */
export function manyPackages(count: number): MapEntry[] {
  return Array.from({ length: count }, (_, i) => ({ fqn: `/workspace::Package${i}`, name: `Package${i}`.padEnd(60, "x"), kind: "package" }));
}

/** A graph with no node and no edge. */
export const EMPTY_GRAPH: GraphSummary = { nodes: [], edges: [], nodeCount: 0, edgeCount: 0, cycleCount: 0, cycles: [], cyclesTruncated: false };

// The payload shapes the harvest tests render: the graph as captured live 2026-08-06, the packages as
// package_summary and codebase_map return them at the pin (2026-10-30).
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import type { GraphSummary, MapEntry, PackageSummary } from "../../../../src/shared/domain/code-intel-contract.ts";

export const MODULE_GRAPH: GraphSummary = {
  nodes: [
    { fqn: `${WORKSPACE}/src/index.ts`, name: "index.ts", kind: "module" },
    { fqn: `${WORKSPACE}/src/math.ts`, name: "math.ts", kind: "module" },
  ],
  // From the live capture: endpoints are node IDs, kind is the numeric enum.
  edges: [{ from: `${WORKSPACE}/src/index.ts#module@0`, to: `${WORKSPACE}/src/math.ts#module@0`, kind: "1" }],
  nodeCount: 2,
  edgeCount: 1,
  cycleCount: 0,
};

/** A graph that reached the 200 modules it was asked for. */
export const SAMPLED_GRAPH: GraphSummary = { ...MODULE_GRAPH, nodeCount: 200 };

export const PACKAGE: PackageSummary = {
  fqn: `${WORKSPACE}::workspace`, name: "workspace", files: 3, symbols: 6, dependencies: [],
  entryPoints: [`${WORKSPACE}/src/index.ts`],
  exports: [`${WORKSPACE}/src/types.ts::Order.total`, `${WORKSPACE}/src/types.ts::Order`],
};

/** A package whose summary returned `count` exports. */
export function packageExporting(count: number): PackageSummary {
  const exports = Array.from({ length: count }, (_, i) => `/w/f${i}.ts::S${i}`);
  return { ...PACKAGE, exports };
}

/** `count` packages of the L1 map, each with `children` modules. */
export function mapPackages(count: number, children = 4): MapEntry[] {
  return Array.from({ length: count }, (_, i) => ({ fqn: `/w/p${i}`, name: `p${i}`, kind: "package", children }));
}

/** The L1 map entries the ranking tests order, in the index's order. */
export const L1_ENTRIES: MapEntry[] = [
  { fqn: "/w/templates", name: "templates", kind: "package", children: 2 },
  { fqn: "/w/Core.Tests", name: "Core.Tests", kind: "package", children: 90 },
  { fqn: "/w/Core", name: "Core", kind: "package", children: 40 },
  { fqn: "/w/docs", name: "docs", kind: "package" },
  { fqn: "/w/Api", name: "Api", kind: "package", children: 40 },
];

/** The fqns of L1_ENTRIES once ranked. */
export const L1_RANKED = ["/w/Core", "/w/Api", "/w/templates", "/w/docs", "/w/Core.Tests"];

export const EXPORTS_IN_INDEX_ORDER = [
  "/w/a.cs::Order.Total", "/w/a.cs::Order", "/w/b.cs::Customer.Name.Get", "/w/b.cs::Customer", "/w/c.ts::greet",
];

export const EXPORTS_RANKED = [
  "/w/a.cs::Order", "/w/b.cs::Customer", "/w/c.ts::greet", "/w/a.cs::Order.Total", "/w/b.cs::Customer.Name.Get",
];

export interface EndpointCase {
  name: string;
  endpoint: string;
  path: string;
}

/** Edge endpoints and the paths they stand for. */
export const ENDPOINTS: readonly EndpointCase[] = [
  { name: "strips the node-ID suffix the live capture surfaced", endpoint: `${WORKSPACE}/src/index.ts#module@0`, path: `${WORKSPACE}/src/index.ts` },
  { name: "leaves a plain path as it is", endpoint: `${WORKSPACE}/src/plain.ts`, path: `${WORKSPACE}/src/plain.ts` },
];

/** Package names, and whether each is one of tests. */
export const TEST_PACKAGE_CASES: readonly { readonly name: string; readonly test: boolean }[] = [
  { name: "Orkeon.Domain.Tests", test: true },
  { name: "tests", test: true },
  { name: "api-test", test: true },
  { name: "CoreTests", test: true },
  { name: "Orkeon.Domain", test: false },
  { name: "contests", test: false },
  { name: "attestation", test: false },
];

/** Names of the index and how the harvest writes them. */
export const DISPLAY_CASES: readonly { readonly name: string; readonly fqn: string; readonly shown: string }[] = [
  { name: "writes a symbol relative to the checkout", fqn: `${WORKSPACE}/src/a.ts::F`, shown: "src/a.ts::F" },
  { name: "writes a package by its name alone", fqn: `${WORKSPACE}::Orkeon.Domain`, shown: "Orkeon.Domain" },
  { name: "leaves a name outside the checkout as it is", fqn: "/elsewhere/a.ts::F", shown: "/elsewhere/a.ts::F" },
  { name: "leaves a path that only starts like the checkout as it is", fqn: `${WORKSPACE}2/a.ts`, shown: `${WORKSPACE}2/a.ts` },
];

/** A package read by package_summary: its dependencies by name, and whether it has an entry module. */
export function readPackage(name: string, dependencies: string[] = [], entry = false): PackageSummary {
  return {
    fqn: `${WORKSPACE}::${name}`, name, files: 2, symbols: 4,
    dependencies: dependencies.map((d) => `${WORKSPACE}::${d}`),
    entryPoints: entry ? [`${WORKSPACE}/src/${name}/Program.cs`] : [],
    exports: [],
  };
}

/** Core, the API over it, the CLI over both, a tool alone and the tests of Core and of the CLI, each but Core
 *  with an entry module: the entry packages are the CLI, whose tests depend on it, and the tool. */
export const HOSTED: PackageSummary[] = [
  readPackage("Core"),
  readPackage("Api", ["Core"], true),
  readPackage("Cli", ["Core", "Api"], true),
  readPackage("Tool", [], true),
  readPackage("Core.Tests", ["Core"], true),
  readPackage("Cli.Tests", ["Cli"], true),
];

/** The fqns of the entry packages of HOSTED. */
export const HOSTED_ENTRIES = [`${WORKSPACE}::Cli`, `${WORKSPACE}::Tool`];

/** A → B → C → A, D → A, and E → E's neighbour F → E: two cycles. */
export const CYCLIC: PackageSummary[] = [
  readPackage("A", ["B"]),
  readPackage("B", ["C"]),
  readPackage("C", ["A"]),
  readPackage("D", ["A"]),
  readPackage("E", ["F"]),
  readPackage("F", ["E", "Outside"]),
];

/** The cycles of CYCLIC, by fqn. */
export const CYCLIC_CYCLES = [
  [`${WORKSPACE}::A`, `${WORKSPACE}::B`, `${WORKSPACE}::C`],
  [`${WORKSPACE}::E`, `${WORKSPACE}::F`],
];

/** `count` packages of the map, the largest first, whose last one is a small host nothing depends on. */
export function rankedWithSmallHost(count: number): { ranked: MapEntry[]; scanned: PackageSummary[] } {
  const scanned = Array.from({ length: count }, (_, i) => readPackage(`p${i}`, [], i === count - 1));
  const ranked = scanned.map((p, i) => ({ fqn: p.fqn, name: p.name, kind: "package", children: count - i }));
  return { ranked, scanned };
}

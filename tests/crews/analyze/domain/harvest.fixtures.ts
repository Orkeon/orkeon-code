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
  cycles: [],
  cyclesTruncated: false,
};

/** A graph whose cycles the index names (Orkeon #272): five counted, two named, the first cut to three of its four members. */
export const NAMED_CYCLES_GRAPH: GraphSummary = {
  ...MODULE_GRAPH,
  cycleCount: 5,
  cycles: [
    { members: [`${WORKSPACE}/src/a.ts`, `${WORKSPACE}/src/b.ts`, `${WORKSPACE}/src/c.ts`], memberCount: 4 },
    { members: [`${WORKSPACE}/src/d.ts`, `${WORKSPACE}/src/e.ts`], memberCount: 2 },
  ],
  cyclesTruncated: true,
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

/** A package read by package_summary: its dependencies by name, and its entry module — `true` a
 *  `Program.cs`, which starts a process, a text the module's file name, none otherwise. */
export function readPackage(name: string, dependencies: string[] = [], entry: boolean | string = false): PackageSummary {
  const module = entry === true ? "Program.cs" : entry;
  return {
    fqn: `${WORKSPACE}::${name}`, name, files: 2, symbols: 4,
    dependencies: dependencies.map((d) => `${WORKSPACE}::${d}`),
    entryPoints: module === false ? [] : [`${WORKSPACE}/src/${name}/${module}`],
    exports: [],
  };
}

/** Core, the API over it, the CLI over both, a tool alone and the tests of Core and of the CLI, each but Core
 *  with an index module: the entry packages are the CLI, whose tests depend on it, and the tool. */
export const HOSTED: PackageSummary[] = [
  readPackage("Core"),
  readPackage("Api", ["Core"], "index.ts"),
  readPackage("Cli", ["Core", "Api"], "index.ts"),
  readPackage("Tool", [], "index.ts"),
  readPackage("Core.Tests", ["Core"], "index.ts"),
  readPackage("Cli.Tests", ["Cli"], "index.ts"),
];

/** A domain, the API over it, the host and the migration service that start the API, and a gateway an SDK (a
 *  library) is built on: the API stays an entry package under its two hosts, the gateway is a library's part. */
export const HOSTS: PackageSummary[] = [
  readPackage("Domain"),
  readPackage("WebApi", ["Domain"], true),
  readPackage("AppHost", ["WebApi"], true),
  readPackage("Migrations", ["WebApi"], true),
  readPackage("Gateway", [], true),
  readPackage("Sdk", ["Gateway"]),
  readPackage("WebApi.Tests", ["WebApi"], true),
];

/** The fqns of the entry packages of HOSTS. */
export const HOSTS_ENTRIES = [`${WORKSPACE}::WebApi`, `${WORKSPACE}::AppHost`, `${WORKSPACE}::Migrations`];

/** Entry modules, and whether a package holding each starts a process. */
export const PROCESS_CASES: readonly { readonly name: string; readonly module: string; readonly starts: boolean }[] = [
  { name: "a Program.cs starts a process", module: "Program.cs", starts: true },
  { name: "a main.py starts a process", module: "main.py", starts: true },
  { name: "a __main__.py starts a process", module: "__main__.py", starts: true },
  { name: "a Main.java starts a process", module: "Main.java", starts: true },
  { name: "an index.ts starts none", module: "index.ts", starts: false },
  { name: "a maintenance.py starts none", module: "maintenance.py", starts: false },
  { name: "a programs.ts starts none", module: "programs.ts", starts: false },
];

/** A large repository of ten packages, a loose package in no repository, then a small repository of three whose
 *  last package is a host: the L1 ranking, the packages read and the repository of each. */
export function rankedAcrossRepositories(): {
  ranked: MapEntry[]; scanned: PackageSummary[]; repositories: Map<string, string>;
} {
  const big = Array.from({ length: 10 }, (_, i) => readPackage(`big${i}`));
  const small = [readPackage("small0"), readPackage("small1"), readPackage("small2", [], true)];
  const scanned = [...big, readPackage("loose"), ...small];
  const ranked = scanned.map((p, i) => ({ fqn: p.fqn, name: p.name, kind: "package", children: scanned.length - i }));
  const repositories = new Map([
    ...big.map((p) => [p.fqn, "big"] as const), ...small.map((p) => [p.fqn, "small"] as const),
  ]);
  return { ranked, scanned, repositories };
}

/** The API and its tests in the repository `api`, the SDK and the models they take in `platform`, a script in no
 *  repository: the API is summarized, the rest named. */
export function harvestAcrossRepositories() {
  const api = readPackage("Api", ["Platform.Sdk", "Platform.Models"], true);
  const sdk = readPackage("Platform.Sdk", ["Platform.Models"]);
  const models = readPackage("Platform.Models");
  const script = readPackage("convert");
  const tests = readPackage("Api.Tests", ["Api", "Platform.Sdk"]);
  const scanned = [api, sdk, models, script, tests];
  return {
    packages: [api],
    unsummarized: [sdk, models, script, tests].map((p) => ({ fqn: p.fqn, name: p.name, kind: "package", children: 3 })),
    scanned,
    moduleGraph: MODULE_GRAPH, graphCap: 200, mapCap: 1000,
    repositories: new Map([
      [api.fqn, "api"], [tests.fqn, "api"], [sdk.fqn, "platform"], [models.fqn, "platform"],
    ]),
  };
}

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

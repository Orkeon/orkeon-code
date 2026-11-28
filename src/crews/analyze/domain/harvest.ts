// /analyze — pure rendering of the deterministic harvest, and the synthesis
// prompts. No IO: the use case reads the index through the CodeIndex port (its
// adapter applies the code-intel-contract readers) and passes the READ payloads
// here; this module only chooses and formats.
//
// The design point: the command chains index → map → dependency_graph → package summaries ITSELF,
// so "does the model pick the right tool?" never arises — the harvest is already
// in the prompt when the single synthesis call runs, and the synthesis agent has
// NO tools to call. `--raw` returns the harvest untouched (zero LLM).

import type {
  GraphSummary, MapEntry, PackageSummary,
} from "../../../shared/domain/code-intel-contract.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";
import {
  andMoreAfterComma, atLeast, cycleModules, dependsOn, ENTRY_POINTS_LABEL, entryPackagesSection, HARVEST_TITLE, inRepository,
  languageLine, largestNamed, MODULE_DEPENDENCIES_HEADING, moduleCyclesHeading, moduleCyclesUnnamed, moduleGraphSample,
  moduleGraphSize, morePackagesOmitted, NO_ENTRY_PACKAGE, NO_MODULE_CYCLE, NO_PACKAGE_CYCLE, NO_PACKAGE_DEPENDENCY,
  NO_REPOSITORY_DEPENDENCY, OTHER_PACKAGES_HEADING, outsideRepositories, packageCyclesHeading, packageDependenciesSection,
  packageHeading, packagesHeading, pathsRelativeTo, publicExports, readFromAll, readFromLargest, repositoriesSection,
  repositoryDependenciesSection, repositoryDependency, repositoryLine, repositoryNotRead, repositoryUnknown,
  synthesisAsk,
} from "./prompts.ts";
import { namesNoFile, repositoryDependencies } from "./repositories.ts";

/** Public exports listed per summarized package — 20 names say what a package offers, 50 drown the rest. */
export const MAX_EXPORTS_PER_PACKAGE = 20;
/** Packages left unsummarized that the harvest still names, with their size. */
export const MAX_LISTED_PACKAGES = 100;
/** Summarized packages kept for the entry packages, however small: the hosts are what the analysis must name. */
export const MAX_ENTRY_PACKAGES = 5;
/** Packages in no single repository that the repositories section names. */
export const MAX_OUTSIDE_PACKAGES = 20;

export interface HarvestInput {
  /** The packages summarized (readPackageSummary), in rankPackages order. */
  packages: PackageSummary[];
  /** The other packages of the L1 map, in rankPackages order: named, not summarized. */
  unsummarized: MapEntry[];
  /** Every package read (summarized or not), in rankPackages order: their dependencies and entry points. */
  scanned: PackageSummary[];
  /** L2 module dependency graph (readGraph of dependency_graph). */
  moduleGraph: GraphSummary;
  /** The max_nodes the graph was asked with: a graph that reaches it is a sample of the index. */
  graphCap: number;
  /** The max_entries the package map was asked with: a map that reaches it stops there, the index holds more. */
  mapCap: number;
  /** The repository of each package read, by fqn (packageRepositories): absent or empty in an ordinary
   *  checkout, where the harvest says nothing of repositories. */
  repositories?: ReadonlyMap<string, string>;
  /** The top folders that are repositories (findRepositories), whether a package of theirs was read or not:
   *  absent or empty in an ordinary checkout. */
  repositoryFolders?: readonly string[];
}

/** Edge endpoints are node IDs ("/path#module@0"), not FQNs — display the path half. */
export function edgeEndpointToPath(id: string): string {
  const hash = id.indexOf("#");
  return hash > 0 ? id.slice(0, hash) : id;
}

/** A name of the index as the harvest writes it: relative to the checkout ("/workspace/src/a.ts::F" is
 *  "src/a.ts::F", the package "/workspace::Core" is "Core"); any other name as given. */
export function displayFqn(fqn: string): string {
  if (fqn.startsWith(`${WORKSPACE}::`)) return fqn.slice(WORKSPACE.length + 2);
  if (fqn.startsWith(`${WORKSPACE}/`)) return fqn.slice(WORKSPACE.length + 1);
  return fqn;
}

/** A package of tests ("Orkeon.Domain.Tests", "tests", "api-test", "CoreTests"): it says less of the domain. */
export function isTestPackage(name: string): boolean {
  return /(^|[.\-_/])tests?$/i.test(name) || /[a-z0-9]Tests?$/.test(name);
}

/** The packages to summarize first: the code before the tests, then the largest (most child nodes) first;
 *  the index's order breaks ties. The map's own order is the store's, which starts with whatever was
 *  indexed first (a template folder, a docs site), not with what matters. */
export function rankPackages(entries: MapEntry[]): MapEntry[] {
  return entries
    .map((entry, i) => ({ entry, i, test: isTestPackage(entry.name) ? 1 : 0 }))
    .sort((a, b) => a.test - b.test || (b.entry.children ?? 0) - (a.entry.children ?? 0) || a.i - b.i)
    .map((r) => r.entry);
}

/** Whether a package starts a process: one of its entry modules is named main or program ("Program.cs",
 *  "main.py", "__main__.py"), where an index module only gathers what a library offers. */
export function startsProcess(p: PackageSummary): boolean {
  return p.entryPoints.some((fqn) => {
    const symbol = fqn.indexOf("::");
    const file = (symbol < 0 ? fqn : fqn.slice(0, symbol)).split("/").pop() ?? "";
    return /^(_*main_*|program)(\.|$)/i.test(file);
  });
}

/** The entry packages, in the order given: code (not tests) with a main, program or index module that no
 *  package of code read depends on — the hosts, tools and examples that start the rest. Its tests depending
 *  on a host do not make it a library, nor does another host: a package that starts a process stays an
 *  entry package when only packages that start one too depend on it (an API under its migration service). */
export function entryPackages(scanned: PackageSummary[]): PackageSummary[] {
  const code = scanned.filter((p) => !isTestPackage(p.name));
  const dependedOn = new Set(code.flatMap((p) => p.dependencies));
  const dependedOnByLibrary = new Set(code.filter((p) => !startsProcess(p)).flatMap((p) => p.dependencies));
  return code.filter((p) =>
    p.entryPoints.length > 0 && !(startsProcess(p) ? dependedOnByLibrary : dependedOn).has(p.fqn));
}

/** The entry packages each group keeps, MAX_ENTRY_PACKAGES (or `max`) in all: one per group in turn, a
 *  group with fewer leaving its turn to the others. */
function shareEntries(groupEntries: string[][], max: number): string[][] {
  const kept = groupEntries.map((): string[] => []);
  let left = Math.min(MAX_ENTRY_PACKAGES, max);
  for (let turn = 0; left > 0 && groupEntries.some((e) => turn < e.length); turn++) {
    for (let g = 0; g < groupEntries.length && left > 0; g++) {
      if (turn < groupEntries[g].length) {
        kept[g].push(groupEntries[g][turn]);
        left--;
      }
    }
  }
  return kept;
}

/** The fqns to summarize, in `ranked` order: the first MAX_ENTRY_PACKAGES entry packages, then the
 *  largest packages up to `max`. Ranking by size alone leaves out the hosts, which are small. Over
 *  several repositories (`repositories`, the repository of each package), each takes its turn — its entry
 *  packages first, taken in turns up to MAX_ENTRY_PACKAGES in all, then its largest — so that the largest
 *  repository does not fill the harvest alone; the packages in no repository are one more group, the last
 *  in each turn. */
export function selectPackages(
  ranked: MapEntry[], scanned: PackageSummary[], max: number, repositories: ReadonlyMap<string, string> = new Map(),
): string[] {
  const names = [...new Set(repositories.values())];
  const groups = names.length === 0
    ? [ranked]
    : [...names.map((name) => ranked.filter((p) => repositories.get(p.fqn) === name)),
       ranked.filter((p) => !repositories.has(p.fqn))].filter((group) => group.length > 0);
  const entries = entryPackages(scanned).map((p) => p.fqn);
  const kept = shareEntries(groups.map((group) => {
    const own = new Set(group.map((p) => p.fqn));
    return entries.filter((fqn) => own.has(fqn));
  }), max);
  const queues = groups.map((group, g) => [...new Set([...kept[g], ...group.map((p) => p.fqn)])]);

  const chosen = new Set<string>();
  for (let turn = 0; chosen.size < max && queues.some((q) => turn < q.length); turn++) {
    for (const queue of queues) {
      if (chosen.size < max && turn < queue.length) chosen.add(queue[turn]);
    }
  }
  for (const p of ranked) {
    if (chosen.size >= max) break;
    chosen.add(p.fqn);
  }
  return ranked.filter((p) => chosen.has(p.fqn)).map((p) => p.fqn);
}

/** The cycles between the packages read, each as its fqns in the order given (Tarjan's strongly connected
 *  components of two packages or more), in the order of their first package. */
export function packageCycles(scanned: PackageSummary[]): string[][] {
  const deps = new Map(scanned.map((p) => [p.fqn, p.dependencies]));
  const order = new Map(scanned.map((p, i) => [p.fqn, i]));
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  let next = 0;

  const connect = (v: string): void => {
    index.set(v, next);
    low.set(v, next);
    next++;
    stack.push(v);
    onStack.add(v);
    for (const w of deps.get(v) ?? []) {
      if (!deps.has(w)) continue;
      if (!index.has(w)) {
        connect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) !== index.get(v)) return;
    const component: string[] = [];
    let w: string;
    do {
      w = stack.pop()!;
      onStack.delete(w);
      component.push(w);
    } while (w !== v);
    if (component.length > 1) cycles.push(component.sort((a, b) => order.get(a)! - order.get(b)!));
  };

  for (const p of scanned) if (!index.has(p.fqn)) connect(p.fqn);
  return cycles.sort((a, b) => order.get(a[0])! - order.get(b[0])!);
}

/** How deep a symbol sits inside its file: `a.ts::Order` 0, `a.ts::Order.total` 1. */
function memberDepth(fqn: string): number {
  const sep = fqn.lastIndexOf("::");
  const local = sep >= 0 ? fqn.slice(sep + 2) : fqn;
  return local.split(".").length - 1;
}

/** Exports to list first: the types and top-level functions before their members, the index's order kept
 *  within a depth — the 50 exports the tool returns are mostly methods of the first classes it met. */
export function rankExports(fqns: string[]): string[] {
  return fqns
    .map((fqn, i) => ({ fqn, i, depth: memberDepth(fqn) }))
    .sort((a, b) => a.depth - b.depth || a.i - b.i)
    .map((r) => r.fqn);
}

const code = (fqn: string): string => `\`${displayFqn(fqn)}\``;

/** A package as the harvest names it: with its repository, over several repositories. */
function named(fqn: string, h: HarvestInput): string {
  const repository = h.repositories?.get(fqn);
  return code(fqn) + (repository === undefined ? "" : inRepository(`\`${repository}\``));
}

function renderPackage(p: PackageSummary, h: HarvestInput): string {
  const lines = [
    packageHeading(named(p.fqn, h), p.files, p.symbols) +
    (p.dependencies.length > 0 ? dependsOn(p.dependencies.map(displayFqn).join(", ")) : ""),
  ];
  if (p.entryPoints.length > 0) {
    lines.push(ENTRY_POINTS_LABEL + p.entryPoints.map(code).join(", "));
  }
  if (p.exports.length > 0) {
    const shown = rankExports(p.exports).slice(0, MAX_EXPORTS_PER_PACKAGE);
    lines.push(publicExports(shown.length, p.exports.length));
    for (const e of shown) lines.push(`- ${code(e)}`);
  }
  return lines.join("\n");
}

/** How many of the packages of the index were read for what the sections below say. */
function readScope(h: HarvestInput, total: number): string {
  const unread = total - h.scanned.length;
  return unread > 0 ? readFromLargest(h.scanned.length, unread) : readFromAll(h.scanned.length);
}

/** The first MAX_OUTSIDE_PACKAGES of `packages` by name, and the note of how many more. */
function packageList(packages: PackageSummary[]): [string, string] {
  const shown = packages.slice(0, MAX_OUTSIDE_PACKAGES);
  const more = packages.length > shown.length ? andMoreAfterComma(packages.length - shown.length) : "";
  return [shown.map((p) => code(p.fqn)).join(", "), more];
}

/** Over several repositories: each with its packages (a repository none of whose packages was read is named
 *  as such), the packages outside them apart from those whose repository is unknown, then what crosses from
 *  one to another. Nothing in an ordinary checkout. */
function renderRepositories(h: HarvestInput, total: number): string[] {
  const of = h.repositories ?? new Map<string, string>();
  // Those that hold a package read first, in the order of their first package, then the others.
  const names = [...new Set([...of.values(), ...(h.repositoryFolders ?? [])])];
  if (names.length === 0) return [];

  const summarized = new Set(h.packages.map((p) => p.fqn));
  const lines = names.map((name) => {
    const own = h.scanned.filter((p) => of.get(p.fqn) === name);
    return own.length === 0
      ? repositoryNotRead(`\`${name}\``)
      : repositoryLine(`\`${name}\``, own.length, own.filter((p) => summarized.has(p.fqn)).length);
  });
  const outside = h.scanned.filter((p) => !of.has(p.fqn));
  const placed = outside.filter((p) => !namesNoFile(p));
  const unknown = outside.filter(namesNoFile);
  if (placed.length > 0) lines.push(outsideRepositories(...packageList(placed)));
  if (unknown.length > 0) lines.push(repositoryUnknown(...packageList(unknown)));

  const crossing = repositoryDependencies(h.scanned, of).map((d) =>
    repositoryDependency(`\`${d.from}\``, `\`${d.to}\``,
      d.edges.map((e) => `${code(e.from)} → ${e.to.map(code).join(", ")}`).join("; ")));

  return [
    repositoriesSection(names.length) + lines.join("\n"),
    repositoryDependenciesSection(readScope(h, total)) +
    (crossing.length > 0 ? crossing.join("\n") : NO_REPOSITORY_DEPENDENCY),
  ];
}

/** What the packages read say of the packages: the entry packages, the dependencies, their cycles. */
function renderPackageGraph(h: HarvestInput, total: number): string[] {
  if (h.scanned.length === 0) return [];
  const scope = readScope(h, total);

  const entries = entryPackages(h.scanned);
  const entryLines = entries.length > 0
    ? entries.map((p) => `- ${named(p.fqn, h)} — ${p.entryPoints.map(code).join(", ")}`)
    : [NO_ENTRY_PACKAGE];

  const depLines = h.scanned.filter((p) => p.dependencies.length > 0)
    .map((p) => `- ${code(p.fqn)} → ${p.dependencies.map(code).join(", ")}`);
  const cycles = packageCycles(h.scanned);
  const cycleLines = cycles.length > 0
    ? [packageCyclesHeading(cycles.length),
       ...cycles.map((c) => "- " + [...c, c[0]].map(code).join(" → "))]
    : [NO_PACKAGE_CYCLE];

  return [
    entryPackagesSection(scope) +
    entryLines.join("\n"),
    packageDependenciesSection(scope) +
    (depLines.length > 0 ? depLines.join("\n") + "\n" : NO_PACKAGE_DEPENDENCY) +
    cycleLines.join("\n"),
  ];
}

/** The cycles of the whole module graph: the modules of each, as the index names them (Orkeon #272), the
 *  largest first; a count alone from a runtime before #273, which does not name them. */
function renderModuleCycles(g: GraphSummary): string {
  if (g.cycleCount === 0) return NO_MODULE_CYCLE;
  if (g.cycles.length === 0) {
    return moduleCyclesUnnamed(g.cycleCount);
  }
  const shown = g.cycles.length < g.cycleCount ? largestNamed(g.cycles.length) : "";
  const lines = g.cycles.map((c) => {
    const more = c.memberCount > c.members.length ? andMoreAfterComma(c.memberCount - c.members.length) : "";
    return cycleModules(c.memberCount, c.members.map(code).join(", "), more);
  });
  return [moduleCyclesHeading(g.cycleCount, shown), ...lines].join("\n");
}

/** The module graph: its sample when it reached its cap, and its cycles — those of the whole graph. */
function renderModuleGraph(h: HarvestInput): string {
  const g = h.moduleGraph;
  const cycles = renderModuleCycles(g);
  const lines: string[] = [];
  if (g.nodeCount >= h.graphCap) {
    // The first modules in the store's order are whatever was indexed first (templates, examples): their
    // edges say nothing of the packages above and would only weigh on the synthesis.
    lines.push(moduleGraphSample(h.graphCap, g.edgeCount), cycles);
  } else {
    lines.push(moduleGraphSize(g.nodeCount, g.edgeCount), cycles);
    for (const e of g.edges) {
      lines.push(`- ${displayFqn(edgeEndpointToPath(e.from))} → ${displayFqn(edgeEndpointToPath(e.to))}`);
    }
  }
  return MODULE_DEPENDENCIES_HEADING + lines.join("\n");
}

/** The deterministic harvest, as markdown. This IS the `--raw` output. */
export function renderHarvest(h: HarvestInput): string {
  const parts: string[] = [HARVEST_TITLE + pathsRelativeTo(WORKSPACE)];

  const total = h.packages.length + h.unsummarized.length;
  parts.push(...renderRepositories(h, total));
  if (h.packages.length > 0) {
    const symbols = h.packages.reduce((sum, p) => sum + p.symbols, 0);
    const inIndex = total >= h.mapCap ? atLeast(total) : `${total}`;
    parts.push(
      packagesHeading(inIndex, h.packages.length, symbols) +
      h.packages.map((p) => renderPackage(p, h)).join("\n\n"),
    );
  }

  if (h.unsummarized.length > 0) {
    const listed = h.unsummarized.slice(0, MAX_LISTED_PACKAGES);
    const omitted = h.unsummarized.length - listed.length;
    parts.push(
      OTHER_PACKAGES_HEADING +
      listed.map((p) => `- ${named(p.fqn, h)}` + (p.children === undefined ? "" : ` — ${p.children} module(s)`)).join("\n") +
      (omitted > 0 ? morePackagesOmitted(omitted, MAX_LISTED_PACKAGES) : ""),
    );
  }

  parts.push(...renderPackageGraph(h, total), renderModuleGraph(h));
  return parts.join("\n\n");
}

/** Concepts the synthesis names at most, those with the most symbols first. */
export const MAX_SYNTHESIS_CONCEPTS = 10;

/** User body of the synthesis call: the ask, each part bounded so a large harvest still gives one screen, then
 *  the harvest it must use, then the language to write in when the session sets one (`answer.language`). */
export function buildSynthesisUser(harvest: string, language?: string): string {
  return (
    synthesisAsk(MAX_SYNTHESIS_CONCEPTS) +
    "<harvest>\n" + harvest + "\n</harvest>" +
    (language !== undefined && language.trim() !== "" ? "\n\n" + languageLine(language.trim()) : "")
  );
}

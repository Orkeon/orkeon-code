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
  andMore, atLeast, cycleModules, dependsOn, ENTRY_POINTS_LABEL, entryPackagesSection, HARVEST_TITLE, languageLine,
  largestNamed, MODULE_DEPENDENCIES_HEADING, moduleCyclesHeading, moduleCyclesUnnamed, moduleGraphSample, moduleGraphSize,
  morePackagesOmitted, NO_ENTRY_PACKAGE, NO_MODULE_CYCLE, NO_PACKAGE_CYCLE, NO_PACKAGE_DEPENDENCY, OTHER_PACKAGES_HEADING,
  packageCyclesHeading, packageDependenciesSection, packageHeading, packagesHeading, pathsRelativeTo, publicExports,
  readFromAll, readFromLargest, synthesisAsk,
} from "./prompts.ts";

/** Public exports listed per summarized package — 20 names say what a package offers, 50 drown the rest. */
export const MAX_EXPORTS_PER_PACKAGE = 20;
/** Packages left unsummarized that the harvest still names, with their size. */
export const MAX_LISTED_PACKAGES = 100;
/** Summarized packages kept for the entry packages, however small: the hosts are what the analysis must name. */
export const MAX_ENTRY_PACKAGES = 5;

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

/** The entry packages, in the order given: code (not tests) with a main, program or index module that no
 *  package of code read depends on — the hosts, tools and examples that start the rest. Its tests depending
 *  on a host do not make it a library. */
export function entryPackages(scanned: PackageSummary[]): PackageSummary[] {
  const dependedOn = new Set(scanned.filter((p) => !isTestPackage(p.name)).flatMap((p) => p.dependencies));
  return scanned.filter((p) => p.entryPoints.length > 0 && !isTestPackage(p.name) && !dependedOn.has(p.fqn));
}

/** The fqns to summarize, in `ranked` order: the first MAX_ENTRY_PACKAGES entry packages, then the
 *  largest packages up to `max`. Ranking by size alone leaves out the hosts, which are small. */
export function selectPackages(ranked: MapEntry[], scanned: PackageSummary[], max: number): string[] {
  const chosen = new Set(entryPackages(scanned).slice(0, Math.min(MAX_ENTRY_PACKAGES, max)).map((p) => p.fqn));
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

function renderPackage(p: PackageSummary): string {
  const lines = [
    packageHeading(code(p.fqn), p.files, p.symbols) +
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

/** What the packages read say of the packages: the entry packages, the dependencies, their cycles. */
function renderPackageGraph(h: HarvestInput, total: number): string[] {
  if (h.scanned.length === 0) return [];
  const unread = total - h.scanned.length;
  const scope = unread > 0 ? readFromLargest(h.scanned.length, unread) : readFromAll(h.scanned.length);

  const entries = entryPackages(h.scanned);
  const entryLines = entries.length > 0
    ? entries.map((p) => `- ${code(p.fqn)} — ${p.entryPoints.map(code).join(", ")}`)
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
    const more = c.memberCount > c.members.length ? andMore(c.memberCount - c.members.length) : "";
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
  if (h.packages.length > 0) {
    const symbols = h.packages.reduce((sum, p) => sum + p.symbols, 0);
    const inIndex = total >= h.mapCap ? atLeast(total) : `${total}`;
    parts.push(
      packagesHeading(inIndex, h.packages.length, symbols) +
      h.packages.map(renderPackage).join("\n\n"),
    );
  }

  if (h.unsummarized.length > 0) {
    const listed = h.unsummarized.slice(0, MAX_LISTED_PACKAGES);
    const omitted = h.unsummarized.length - listed.length;
    parts.push(
      OTHER_PACKAGES_HEADING +
      listed.map((p) => `- ${code(p.fqn)}` + (p.children === undefined ? "" : ` — ${p.children} module(s)`)).join("\n") +
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

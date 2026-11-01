// The package map /init shows the model for the Architecture section: the packages of the code index, one
// line each with the packages it depends on, bounded. Pure, no IO: the use case reads the L1 map and the
// L1 dependency graph through the CodeIndex port.

import type { GraphSummary, MapEntry } from "../../../shared/domain/code-intel-contract.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";
import { cutLine } from "../../../shared/domain/project-manifests.ts";

/** Characters of the rendered map, the cut marker aside. */
export const MAX_PACKAGE_MAP_CHARS = 4_000;

/** Packages asked of the L1 map, and nodes of the L1 dependency graph: the map shows at most that many. */
export const MAX_MAP_PACKAGES = 200;

/** A package name as the map writes it, the checkout prefix ("/workspace::Core") left out. */
function shortName(fqn: string): string {
  if (fqn.startsWith(`${WORKSPACE}::`)) return fqn.slice(WORKSPACE.length + 2);
  if (fqn.startsWith(`${WORKSPACE}/`)) return fqn.slice(WORKSPACE.length + 1);
  return fqn;
}

/** The package an edge endpoint names: a node id ("<fqn>#package@0") or a fqn. */
function endpointFqn(id: string): string {
  const hash = id.indexOf("#");
  return hash > 0 ? id.slice(0, hash) : id;
}

/** The lines of the map: the largest packages (most children) first, the map's order breaking ties. */
function packageLines(entries: readonly MapEntry[], graph: GraphSummary): string[] {
  const names = new Map<string, string>();
  for (const n of graph.nodes) names.set(n.fqn, n.name || shortName(n.fqn));
  for (const e of entries) names.set(e.fqn, e.name || shortName(e.fqn));
  const nameOf = (id: string): string => names.get(id) ?? names.get(endpointFqn(id)) ?? shortName(endpointFqn(id));
  const dependsOn = new Map<string, string[]>();
  for (const e of graph.edges) {
    const from = nameOf(e.from);
    const to = nameOf(e.to);
    if (from === to) continue;
    const list = dependsOn.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    dependsOn.set(from, list);
  }
  const ranked = entries.map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.children ?? 0) - (a.e.children ?? 0) || a.i - b.i);
  return ranked.map(({ e }) => {
    const name = names.get(e.fqn) ?? shortName(e.fqn);
    const deps = dependsOn.get(name) ?? [];
    return deps.length > 0 ? `- ${name} ← depends on ${deps.join(", ")}` : `- ${name}`;
  });
}

/** The header of the map: the count of packages, and that the map stops at MAX_MAP_PACKAGES when it
 *  reached it, since the project may hold more. */
function header(count: number): string {
  const bound = count >= MAX_MAP_PACKAGES ? `, the map shows at most ${MAX_MAP_PACKAGES} packages` : "";
  return `${count} package(s)${bound}, each with the packages it depends on:`;
}

/** The package map as material, at most `max` characters and a marker line when cut; "" with no package. */
export function renderPackageMap(entries: readonly MapEntry[], graph: GraphSummary, max = MAX_PACKAGE_MAP_CHARS): string {
  if (entries.length === 0) return "";
  const lines = [header(entries.length), ...packageLines(entries, graph)];
  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > max) break;
    kept.push(line);
    size += line.length + 1;
  }
  const omitted = lines.slice(kept.length).reduce((n, l) => n + l.length + 1, 0);
  if (omitted > 0) kept.push(cutLine(omitted, "the package map"));
  return kept.join("\n");
}

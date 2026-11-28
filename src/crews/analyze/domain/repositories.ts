// /analyze over a folder of several repositories — which repository a package belongs to, and what crosses
// from one to another. Pure: the use case finds which top folders are repositories (the Files port) and
// passes their names here.

import type { PackageSummary } from "../../../shared/domain/code-intel-contract.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** The top folder of the checkout a name of the index sits in: "/workspace/api/src/a.cs::F" is "api"; none
 *  for a file at the root of the checkout, or a name outside it. */
function topFolder(fqn: string): string | undefined {
  if (!fqn.startsWith(`${WORKSPACE}/`)) return undefined;
  const symbol = fqn.indexOf("::");
  const path = fqn.slice(WORKSPACE.length + 1, symbol < 0 ? undefined : symbol);
  const slash = path.indexOf("/");
  return slash > 0 ? path.slice(0, slash) : undefined;
}

/** The top folder a package's code sits in, read from its entry modules and public exports: the index
 *  names a package without its path. None when they name no folder, or more than one: a package name two
 *  repositories share is one package for the index. */
export function packageFolder(p: PackageSummary): string | undefined {
  const names = [...p.entryPoints, ...p.exports];
  const folders = new Set(names.map(topFolder));
  const [only] = folders;
  return folders.size === 1 ? only : undefined;
}

/** The top folders the packages read sit in, each once, in the order of their first package. */
export function topFolders(scanned: PackageSummary[]): string[] {
  const folders = new Set<string>();
  for (const p of scanned) {
    const folder = packageFolder(p);
    if (folder !== undefined) folders.add(folder);
  }
  return [...folders];
}

/** The repository of each package read, by fqn, given the top folders that are repositories. Empty unless
 *  two repositories at least hold a package: one repository alone is an ordinary checkout. */
export function packageRepositories(
  scanned: PackageSummary[], repositories: readonly string[],
): Map<string, string> {
  const known = new Set(repositories);
  const of = new Map<string, string>();
  for (const p of scanned) {
    const folder = packageFolder(p);
    if (folder !== undefined && known.has(folder)) of.set(p.fqn, folder);
  }
  return new Set(of.values()).size > 1 ? of : new Map();
}

/** What one repository takes from another: its packages that depend on a package of the other, each with
 *  the packages it depends on there. */
export interface RepositoryDependency {
  from: string;
  to: string;
  edges: Array<{ from: string; to: string[] }>;
}

/** The dependencies that cross from a repository to another, grouped by pair of repositories, in the order
 *  of the packages read. A dependency on a package in no repository crosses nothing. */
export function repositoryDependencies(
  scanned: PackageSummary[], repositoryOf: ReadonlyMap<string, string>,
): RepositoryDependency[] {
  const pairs: RepositoryDependency[] = [];
  for (const p of scanned) {
    const from = repositoryOf.get(p.fqn);
    if (from === undefined) continue;
    for (const dependency of p.dependencies) {
      const to = repositoryOf.get(dependency);
      if (to === undefined || to === from) continue;
      let pair = pairs.find((d) => d.from === from && d.to === to);
      if (pair === undefined) pairs.push(pair = { from, to, edges: [] });
      let edge = pair.edges.find((e) => e.from === p.fqn);
      if (edge === undefined) pair.edges.push(edge = { from: p.fqn, to: [] });
      edge.to.push(dependency);
    }
  }
  return pairs;
}

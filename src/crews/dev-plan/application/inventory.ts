// interim until RT-36 (L-9): the graph answers the anchors of a batch
//
// The inventory of a /dev-plan run: the code the index finds for the titles of the
// source, located, with its direct callers and the modules each file imports. It is the
// only module of the crew that calls the code index, and the single entry L-9 replaces.
// It reads the index and builds it when it holds no root; it writes nothing else.
import type { CodeIndex, CodeSearchHit, Logger } from "../../../shared/application/ports.ts";
import { INVENTORY_CAPS, keepPath, layerOf } from "../domain/inventory-model.ts";
import type { Inventory, InventoryEntry } from "../domain/inventory-model.ts";

export interface InventoryRequest {
  titles: ReadonlyArray<{ id: string; title: string }>;  // source order: UC, BR, CH
  workShown: string;
  layout: { domain?: string; application?: string; infrastructure?: string; tests?: string } | null;
  buildOutputs: readonly string[];
}

const WORKSPACE = "/workspace";
const TOP = `${WORKSPACE}/`;
const GRAPH_SCOPE = "L2_Module";

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];
const pathPart = (fqn: string): string => {
  const cut = fqn.indexOf("::");
  return cut >= 0 ? fqn.slice(0, cut) : fqn;
};
const absolute = (path: string): string => (path.startsWith("/") ? path : `${TOP}${path}`);
const relative = (path: string): string => (path.startsWith(TOP) ? path.slice(TOP.length) : path);
const nameOf = (fqn: string): string => {
  const cut = fqn.indexOf("::");
  if (cut >= 0) return fqn.slice(cut + 2);
  return fqn.slice(fqn.lastIndexOf("/") + 1);
};

interface Kept { fqn: string; score: number; origin: string; forIds: Set<string> }

/** Searches each title, then fills the entries one per title, then a second, then a third. */
async function search(
  index: CodeIndex, request: InventoryRequest, keep: (path: string) => string | null, state: { calls: number; warnings: string[] },
): Promise<Kept[]> {
  const titles = request.titles.slice(0, INVENTORY_CAPS.titles);
  const hits: CodeSearchHit[][] = [];
  for (const t of titles) {
    state.calls++;
    try {
      const found = await index.search(t.title, INVENTORY_CAPS.topK);
      hits.push(found.filter((h) => keep(pathPart(h.fqn)) !== null));
    } catch (e) {
      state.warnings.push(`search failed for ${t.id}: ${firstLine(e)}`);
      hits.push([]);
    }
  }
  const kept = new Map<string, Kept>();
  const cursor = titles.map(() => 0);
  const taken = titles.map(() => 0);
  for (let pass = 0; pass < INVENTORY_CAPS.hitsPerTitle; pass++) {
    for (let i = 0; i < titles.length; i++) {
      if (kept.size >= INVENTORY_CAPS.entries) return [...kept.values()];
      if (taken[i] > pass) continue;
      while (cursor[i] < hits[i].length) {
        const hit = hits[i][cursor[i]++];
        const already = kept.get(hit.fqn);
        if (already) { already.forIds.add(titles[i].id); continue; }
        kept.set(hit.fqn, { fqn: hit.fqn, score: hit.score, origin: hit.origin, forIds: new Set([titles[i].id]) });
        taken[i]++;
        break;
      }
    }
  }
  return [...kept.values()];
}

export async function buildInventory(
  index: CodeIndex, request: InventoryRequest, log: Logger,
): Promise<{ ok: true; inventory: Inventory } | { ok: false; text: string }> {
  const state = { calls: 0, warnings: [] as string[] };
  const refuse = (e: unknown) => ({
    ok: false as const,
    text: `dev-plan: the code index cannot be built (${firstLine(e)}): anchors would be guesses, so no plan is written`,
  });

  // 1. The index: present, or built now.
  let status: Inventory["index"] = "present";
  try {
    state.calls++;
    if ((await index.rootCount()) === 0) {
      state.calls++;
      const built = await index.index(WORKSPACE);
      status = built.files === 0 ? "empty" : "built";
    }
  } catch (e) {
    return refuse(e);
  }
  log.info(`dev-plan: code index ${status}`);
  if (status === "empty") {
    state.warnings.push("the code index holds no file: every anchor is a path to create");
    return { ok: true, inventory: { entries: [], index: status, titlesSearched: 0, calls: state.calls, warnings: state.warnings } };
  }

  // 2. The searches and the round robin.
  const keep = (path: string): string | null => keepPath(absolute(path), [request.workShown], request.buildOutputs);
  const titlesSearched = Math.min(request.titles.length, INVENTORY_CAPS.titles);
  if (request.titles.length > INVENTORY_CAPS.titles) {
    const left = request.titles.slice(INVENTORY_CAPS.titles);
    state.warnings.push(`${left.length} titles not searched: ${left.map((t) => t.id).join(", ")}`);
  }
  const kept = await search(index, request, keep, state);
  log.info(`dev-plan: ${titlesSearched} titles searched, ${kept.length} symbols kept`);

  // 3. Where each kept symbol lives; refs are given to the survivors, in discovery order.
  const order = new Map(request.titles.map((t, i) => [t.id, i]));
  const entries: InventoryEntry[] = [];
  for (const k of kept) {
    state.calls++;
    try {
      const at = await index.symbolSource(k.fqn);
      const path = keep(at.path);
      if (path === null) { state.warnings.push(`${k.fqn} dropped: ${at.path} is outside what a plan may anchor`); continue; }
      entries.push({
        ref: `I${entries.length + 1}`, fqn: k.fqn, name: nameOf(k.fqn), path,
        line: at.startLine, endLine: at.endLine, language: at.language, firstLine: at.firstLine,
        layer: layerOf(path, request.layout),
        forIds: [...k.forIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
        score: k.score, origin: k.origin, callers: [], imports: [],
      });
    } catch (e) {
      state.warnings.push(`${k.fqn} dropped: ${firstLine(e)}`);
    }
  }
  log.info(`dev-plan: ${entries.length} entries located`);

  if (entries.length > 0) {
    // 4. Direct callers of the best entries.
    const best = [...entries].sort((a, b) => b.score - a.score).slice(0, INVENTORY_CAPS.impacts);
    for (const e of best) {
      state.calls++;
      try {
        const impact = await index.impact(e.fqn, 1);
        e.callers = impact.direct.map(relative).slice(0, INVENTORY_CAPS.callers);
      } catch (err) {
        state.warnings.push(`impact failed for ${e.fqn}: ${firstLine(err)}`);
      }
    }
    log.info(`dev-plan: callers asked for ${best.length} entries`);

    // 5. The modules each entry's file imports, from one module graph.
    state.calls++;
    try {
      const graph = await index.dependencyGraph(GRAPH_SCOPE, INVENTORY_CAPS.graphNodes);
      const fileOf = (node: string): string => relative(node.split("#")[0]);
      for (const e of entries) {
        const to = graph.edges.filter((edge) => fileOf(edge.from) === e.path).map((edge) => fileOf(edge.to));
        e.imports = [...new Set(to)].filter((p) => p !== e.path).slice(0, INVENTORY_CAPS.imports);
      }
      log.info(`dev-plan: module graph of ${graph.edges.length} edges joined`);
    } catch (e) {
      state.warnings.push(`the module graph failed: ${firstLine(e)}`);
    }
  }

  return { ok: true, inventory: { entries, index: status, titlesSearched, calls: state.calls, warnings: state.warnings } };
}

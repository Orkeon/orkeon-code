// The anchor index, the hit and request builders and the closures the buildInventory tests read.
import { FakeAnchorIndex } from "../../../../tests/support/fake-anchor-index.ts";
import { FakeCodeIndex } from "../../../../tests/support/fake-code-index.ts";
import type { AnchorClosure, CodeSearchHit, SymbolLocation } from "../../../shared/application/ports.ts";
import type { GraphSummary } from "../../../shared/domain/code-intel-contract.ts";
import type { InventoryRequest } from "./inventory.ts";

/** An anchor index whose every closure is empty. */
export const anchors = (): FakeAnchorIndex => new FakeAnchorIndex();

const LAYOUT = { domain: "src/domain", application: "src/app", tests: "tests" };
export const hit = (fqn: string, score = 0.03): CodeSearchHit => ({ fqn, score, origin: "hybrid" });
export const located = (fqn: string, line = 3): SymbolLocation => ({
  fqn, path: fqn.split("::")[0], startLine: line, endLine: line + 5, language: "typescript", firstLine: `export function ${fqn.split("::")[1] ?? "x"}() {`,
});
export const request = (titles: Array<[string, string]>, over: Partial<InventoryRequest> = {}): InventoryRequest => ({
  titles: titles.map(([id, title]) => ({ id, title })), workShown: "workbench", layout: LAYOUT, buildOutputs: ["dist"], ...over,
});

/** An index holding one root, every searched fqn locatable. */
export function indexWith(hits: Record<string, CodeSearchHit[]>): FakeCodeIndex {
  const index = new FakeCodeIndex();
  index.roots = 1;
  index.hits = hits;
  for (const list of Object.values(hits)) for (const h of list) index.sources[h.fqn] = located(h.fqn);
  return index;
}

/** Makes the search of `query` throw a two-line error, every other search answered as before. */
export function failSearchOn(index: FakeCodeIndex, query: string): void {
  const search = index.search.bind(index);
  index.search = async (q, topK) => {
    if (q === query) throw new Error("timeout\nmore");
    return search(q, topK);
  };
}

/** `n` titles: UC-01 to UC-05, then BR-01 onwards. */
export const titlesOf = (n: number): Array<[string, string]> =>
  Array.from({ length: n }, (_, i) => [i < 5 ? `UC-0${i + 1}` : `BR-${String(i - 4).padStart(2, "0")}`, `title ${i + 1}`]);

/** `per` hits for each title, scored from best to worst, title i's in src/t<i>/. */
export const hitsOf = (titles: Array<[string, string]>, per: number): Record<string, CodeSearchHit[]> =>
  Object.fromEntries(titles.map(([, t], i) => [t, Array.from({ length: per }, (_, j) => hit(`/workspace/src/t${i + 1}/h${j + 1}.ts::h`, 0.1 - j * 0.01))]));

export const BEST = "/workspace/src/t1/h1.ts::h";

/** Seven callers of the best entry. */
export const SEVEN_CALLERS: AnchorClosure = {
  nodes: Array.from({ length: 7 }, (_, i) => `/workspace/src/caller${i}.ts::c`), unresolved: [], truncated: false,
};

/** A module graph: title 1's module imports a twice, title 2's imports b. */
export const MODULE_GRAPH: GraphSummary = {
  nodes: [], nodeCount: 3, edgeCount: 3, cycleCount: 0,
  edges: [
    { from: "/workspace/src/t1/h1.ts#module@0", to: "/workspace/src/shared/a.ts#module@0", kind: "imports" },
    { from: "/workspace/src/t1/h1.ts#module@0", to: "/workspace/src/shared/a.ts#module@0", kind: "imports" },
    { from: "/workspace/src/t2/h1.ts#module@0", to: "/workspace/src/shared/b.ts#module@0", kind: "imports" },
  ],
};

export const FIVE_CALLERS = ["src/caller0.ts::c", "src/caller1.ts::c", "src/caller2.ts::c", "src/caller3.ts::c", "src/caller4.ts::c"];

/** The closure of Order: its own subtree, a sibling that only starts like it, and two outer callers. */
export const ORDER_CLOSURE: AnchorClosure = {
  nodes: [
    "/workspace/src/app/order.ts::Order", "/workspace/src/app/order.ts::Order::add",
    "/workspace/src/app/order.ts::Order::add::inner", "/workspace/src/app/order.ts::OrderLine",
    "/workspace/src/app/cart.ts::Cart::checkout", "/workspace/tests/order.test.ts::adds a line",
  ],
  unresolved: [], truncated: false,
};

/** The hits of the drop test: under .claude/, the work folder, a build output, a re-export and a kept file. */
export const DROPPED_HITS: CodeSearchHit[] = [
  hit("/workspace/.claude/skills/x.ts::a"), hit("/workspace/workbench/prune/notes.ts::b"),
  hit("/workspace/dist/prune.js::c"), hit("/workspace/src/app/reexport.ts::d"), hit("/workspace/src/app/run.ts::e"),
];

export const CLOSURE_WARNINGS = [
  "closure of /workspace/src/a.ts::a truncated",
  "/workspace/src/b.ts::b unknown to batch_anchors",
  "anchors failed for /workspace/src/c.ts::c: store offline",
];

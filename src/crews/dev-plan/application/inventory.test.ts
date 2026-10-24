// The inventory over FakeCodeIndex and FakeAnchorIndex: the index built when it holds no
// root, a build that fails or finds nothing, the round robin and its caps, dedup by fqn,
// the symbol locations, the callers of the best entries from their batch_anchors closure,
// imports from the module graph, the excluded paths, and the call count. Run:
//   node --test src/crews/dev-plan/application/inventory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeCodeIndex } from "../../../../tests/support/fake-code-index.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import type { AnchorClosure, AnchorIndex, CodeSearchHit, SymbolLocation } from "../../../shared/application/ports.ts";
import { buildInventory } from "./inventory.ts";
import type { InventoryRequest } from "./inventory.ts";

/** The closure of each anchor by its fqn (empty when absent), a failure by fqn, and the calls made. */
class FakeAnchorIndex implements AnchorIndex {
  closures: Record<string, AnchorClosure> = {};
  failures: Record<string, Error> = {};
  calls: string[] = [];
  async closure(fqns: readonly string[]): Promise<AnchorClosure> {
    this.calls.push(`closure ${fqns.join(" ")}`);
    const failure = this.failures[fqns[0]];
    if (failure !== undefined) throw failure;
    return this.closures[fqns[0]] ?? { nodes: [], unresolved: [], truncated: false };
  }
}
const anchors = (): FakeAnchorIndex => new FakeAnchorIndex();

const LAYOUT = { domain: "src/domain", application: "src/app", tests: "tests" };
const hit = (fqn: string, score = 0.03): CodeSearchHit => ({ fqn, score, origin: "hybrid" });
const located = (fqn: string, line = 3): SymbolLocation => ({
  fqn, path: fqn.split("::")[0], startLine: line, endLine: line + 5, language: "typescript", firstLine: `export function ${fqn.split("::")[1] ?? "x"}() {`,
});
const request = (titles: Array<[string, string]>, over: Partial<InventoryRequest> = {}): InventoryRequest => ({
  titles: titles.map(([id, title]) => ({ id, title })), workShown: "workbench", layout: LAYOUT, buildOutputs: ["dist"], ...over,
});

/** An index holding one root, every searched fqn locatable. */
function indexWith(hits: Record<string, CodeSearchHit[]>): FakeCodeIndex {
  const index = new FakeCodeIndex();
  index.roots = 1;
  index.hits = hits;
  for (const list of Object.values(hits)) for (const h of list) index.sources[h.fqn] = located(h.fqn);
  return index;
}

describe("buildInventory — the index", () => {
  it("builds the index when it holds no root, then searches", async () => {
    const index = indexWith({ "Prune entries": [hit("/workspace/src/domain/prune.ts::prune")] });
    index.roots = 0;
    index.indexed = { files: 12, nodes: 40, edges: 9, statements: 100, errors: [] };
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune entries"]]), new FakeLogger());
    ok(r.ok);
    strictEqual(r.inventory.index, "built");
    deepStrictEqual(index.calls.slice(0, 3), ["rootCount", "index /workspace", "search Prune entries 8"]);
  });

  it("refuses when the index cannot be built", async () => {
    const index = new FakeCodeIndex();
    index.failure = new Error("store offline\nstack");
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());
    deepStrictEqual(r, {
      ok: false,
      text: "dev-plan: the code index cannot be built (store offline): anchors would be guesses, so no plan is written",
    });
  });

  it("answers an empty inventory with a warning when the build indexes no file", async () => {
    const index = new FakeCodeIndex();
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());
    ok(r.ok);
    strictEqual(r.inventory.index, "empty");
    deepStrictEqual(r.inventory.entries, []);
    deepStrictEqual(r.inventory.warnings, ["the code index holds no file: every anchor is a path to create"]);
    deepStrictEqual(index.calls, ["rootCount", "index /workspace"]);
  });
});

describe("buildInventory — the entries", () => {
  it("keeps a symbol once and adds every id whose title found it, in source order", async () => {
    const shared = hit("/workspace/src/domain/memory.ts::MemoryEntry", 0.05);
    const index = indexWith({ "Prune old entries": [shared], "Keep feedback": [shared, hit("/workspace/src/domain/feedback.ts::isFeedback")] });
    const r = await buildInventory(index, anchors(), request([["UC-01", "Prune old entries"], ["BR-02", "Keep feedback"]]), new FakeLogger());
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => [e.ref, e.path, e.forIds, e.layer]), [
      ["I1", "src/domain/memory.ts", ["UC-01", "BR-02"], "domain"],
      ["I2", "src/domain/feedback.ts", ["BR-02"], "domain"],
    ]);
    const e = r.inventory.entries[0];
    deepStrictEqual([e.name, e.line, e.endLine, e.fqn], ["MemoryEntry", 3, 8, "/workspace/src/domain/memory.ts::MemoryEntry"]);
  });

  it("drops hits under .claude/, the work folder or a build output, and a symbol whose source path is excluded", async () => {
    const index = indexWith({
      Prune: [
        hit("/workspace/.claude/skills/x.ts::a"), hit("/workspace/workbench/prune/notes.ts::b"),
        hit("/workspace/dist/prune.js::c"), hit("/workspace/src/app/reexport.ts::d"), hit("/workspace/src/app/run.ts::e"),
      ],
    });
    index.sources["/workspace/src/app/reexport.ts::d"] = { ...located("/workspace/src/app/reexport.ts::d"), path: "/workspace/.orkeon/gen.ts" };
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => [e.ref, e.path]), [["I1", "src/app/run.ts"]]);
    ok(r.inventory.warnings.includes("/workspace/src/app/reexport.ts::d dropped: /workspace/.orkeon/gen.ts is outside what a plan may anchor"));
  });

  it("drops a symbol the index cannot locate, keeping the refs dense", async () => {
    const index = indexWith({ Prune: [hit("/workspace/src/a.ts::a"), hit("/workspace/src/b.ts::b"), hit("/workspace/src/c.ts::c")] });
    delete index.sources["/workspace/src/b.ts::b"];
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => [e.ref, e.path]), [["I1", "src/a.ts"], ["I2", "src/c.ts"]]);
    ok(r.inventory.warnings.includes("/workspace/src/b.ts::b dropped: no symbol /workspace/src/b.ts::b"));
  });

  it("goes on after a failing search, with a warning", async () => {
    const index = indexWith({ Second: [hit("/workspace/src/s.ts::s")] });
    const search = index.search.bind(index);
    index.search = async (query, topK) => {
      if (query === "First") throw new Error("timeout\nmore");
      return search(query, topK);
    };
    const r = await buildInventory(index, anchors(), request([["BR-01", "First"], ["BR-02", "Second"]]), new FakeLogger());
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => e.forIds), [["BR-02"]]);
    deepStrictEqual(r.inventory.warnings, ["search failed for BR-01: timeout"]);
  });
});

describe("buildInventory — caps and the round robin", () => {
  const titlesOf = (n: number): Array<[string, string]> =>
    Array.from({ length: n }, (_, i) => [i < 5 ? `UC-0${i + 1}` : `BR-${String(i - 4).padStart(2, "0")}`, `title ${i + 1}`]);
  const hitsOf = (titles: Array<[string, string]>, per: number): Record<string, CodeSearchHit[]> =>
    Object.fromEntries(titles.map(([, t], i) => [t, Array.from({ length: per }, (_, j) => hit(`/workspace/src/t${i + 1}/h${j + 1}.ts::h`, 0.1 - j * 0.01))]));

  it("searches 20 titles of 40, one entry each first, then a second for titles 1 to 4", async () => {
    const titles = titlesOf(40);
    const index = indexWith(hitsOf(titles, 4));
    const r = await buildInventory(index, anchors(), request(titles), new FakeLogger());
    ok(r.ok);
    const inv = r.inventory;
    strictEqual(inv.titlesSearched, 20);
    strictEqual(index.calls.filter((c) => c.startsWith("search ")).length, 20);
    strictEqual(inv.entries.length, 24);
    deepStrictEqual(inv.entries.slice(0, 20).map((e) => e.path), titles.slice(0, 20).map((_, i) => `src/t${i + 1}/h1.ts`));
    deepStrictEqual(inv.entries.slice(20).map((e) => e.path), ["src/t1/h2.ts", "src/t2/h2.ts", "src/t3/h2.ts", "src/t4/h2.ts"]);
    for (const [id] of titles.slice(0, 20)) ok(inv.entries.some((e) => e.forIds.includes(id)), `${id} has an entry`);
    ok(inv.warnings[0].startsWith("20 titles not searched: BR-16, BR-17"), inv.warnings[0]);
  });

  it("keeps 3 hits a title at most, and 24 entries at most", async () => {
    const one = titlesOf(1);
    const r1 = await buildInventory(indexWith(hitsOf(one, 4)), anchors(), request(one), new FakeLogger());
    ok(r1.ok);
    deepStrictEqual(r1.inventory.entries.map((e) => e.path), ["src/t1/h1.ts", "src/t1/h2.ts", "src/t1/h3.ts"]);
    const many = titlesOf(21);
    const r2 = await buildInventory(indexWith(hitsOf(many, 4)), anchors(), request(many), new FakeLogger());
    ok(r2.ok);
    strictEqual(r2.inventory.entries.length, 24);
    strictEqual(r2.inventory.titlesSearched, 20);
    deepStrictEqual(r2.inventory.warnings, ["1 titles not searched: BR-16"]);
  });

  it("asks the closure of the 12 best entries, keeps 5 callers made relative, and joins the module graph", async () => {
    const titles = titlesOf(20);
    const index = indexWith(hitsOf(titles, 1));
    const anchorIndex = anchors();
    const best = "/workspace/src/t1/h1.ts::h";
    anchorIndex.closures[best] = {
      nodes: Array.from({ length: 7 }, (_, i) => `/workspace/src/caller${i}.ts::c`), unresolved: [], truncated: false,
    };
    index.graph = {
      nodes: [], nodeCount: 3, edgeCount: 3, cycleCount: 0,
      edges: [
        { from: "/workspace/src/t1/h1.ts#module@0", to: "/workspace/src/shared/a.ts#module@0", kind: "imports" },
        { from: "/workspace/src/t1/h1.ts#module@0", to: "/workspace/src/shared/a.ts#module@0", kind: "imports" },
        { from: "/workspace/src/t2/h1.ts#module@0", to: "/workspace/src/shared/b.ts#module@0", kind: "imports" },
      ],
    };
    const r = await buildInventory(index, anchorIndex, request(titles), new FakeLogger());
    ok(r.ok);
    strictEqual(index.calls.some((c) => c.startsWith("impact ")), false);
    strictEqual(anchorIndex.calls.length, 12);
    strictEqual(anchorIndex.calls[0], `closure ${best}`);
    const first = r.inventory.entries[0];
    deepStrictEqual(first.callers, ["src/caller0.ts::c", "src/caller1.ts::c", "src/caller2.ts::c", "src/caller3.ts::c", "src/caller4.ts::c"]);
    deepStrictEqual(first.imports, ["src/shared/a.ts"]);
    deepStrictEqual(r.inventory.entries[1].imports, ["src/shared/b.ts"]);
    ok(index.calls.includes("dependencyGraph L2_Module 300"));
  });

  it("makes 59 calls at most, and counts each one", async () => {
    const titles = titlesOf(40);
    const index = indexWith(hitsOf(titles, 8));
    index.roots = 0;
    index.indexed = { files: 3, nodes: 1, edges: 0, statements: 1, errors: [] };
    const anchorIndex = anchors();
    const r = await buildInventory(index, anchorIndex, request(titles), new FakeLogger());
    ok(r.ok);
    strictEqual(r.inventory.calls, index.calls.length + anchorIndex.calls.length);
    strictEqual(r.inventory.calls, 59);
    strictEqual(anchorIndex.calls.length, 12);
  });

  it("drops the entry's own subtree from its closure, and only that", async () => {
    const index = indexWith({ Prune: [hit("/workspace/src/app/order.ts::Order", 0.09)] });
    const anchorIndex = anchors();
    anchorIndex.closures["/workspace/src/app/order.ts::Order"] = {
      nodes: [
        "/workspace/src/app/order.ts::Order", "/workspace/src/app/order.ts::Order::add",
        "/workspace/src/app/order.ts::Order::add::inner", "/workspace/src/app/order.ts::OrderLine",
        "/workspace/src/app/cart.ts::Cart::checkout", "/workspace/tests/order.test.ts::adds a line",
      ],
      unresolved: [], truncated: false,
    };
    const r = await buildInventory(index, anchorIndex, request([["BR-01", "Prune"]]), new FakeLogger());
    ok(r.ok);
    deepStrictEqual(r.inventory.entries[0].callers,
      ["src/app/order.ts::OrderLine", "src/app/cart.ts::Cart::checkout", "tests/order.test.ts::adds a line"]);
    deepStrictEqual(r.inventory.warnings, []);
  });

  it("warns on a truncated closure, an anchor batch_anchors does not know, and a failed closure", async () => {
    const index = indexWith({ Prune: [hit("/workspace/src/a.ts::a", 0.09), hit("/workspace/src/b.ts::b", 0.08), hit("/workspace/src/c.ts::c", 0.07)] });
    const anchorIndex = anchors();
    anchorIndex.closures["/workspace/src/a.ts::a"] = { nodes: ["/workspace/src/x.ts::x"], unresolved: [], truncated: true };
    anchorIndex.closures["/workspace/src/b.ts::b"] = { nodes: [], unresolved: ["/workspace/src/b.ts::b"], truncated: false };
    anchorIndex.failures["/workspace/src/c.ts::c"] = new Error("store offline\nstack");
    const r = await buildInventory(index, anchorIndex, request([["BR-01", "Prune"]]), new FakeLogger());
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => e.callers), [["src/x.ts::x"], [], []]);
    deepStrictEqual(r.inventory.warnings, [
      "closure of /workspace/src/a.ts::a truncated",
      "/workspace/src/b.ts::b unknown to batch_anchors",
      "anchors failed for /workspace/src/c.ts::c: store offline",
    ]);
  });

  it("warns when the module graph fails, imports left empty", async () => {
    const index = indexWith({ Prune: [hit("/workspace/src/a.ts::a")] });
    index.dependencyGraph = async () => { throw new Error("graph too large"); };
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());
    ok(r.ok);
    deepStrictEqual(r.inventory.entries[0].imports, []);
    deepStrictEqual(r.inventory.warnings, ["the module graph failed: graph too large"]);
  });
});

// The inventory over FakeCodeIndex and FakeAnchorIndex: the index built when it holds no
// root, a build that fails or finds nothing, the round robin and its caps, dedup by fqn,
// the symbol locations, the callers of the best entries from their batch_anchors closure,
// imports from the module graph, the excluded paths, and the call count. Run:
//   node --test src/crews/dev-plan/application/inventory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeCodeIndex } from "../../../../tests/support/fake-code-index.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { buildInventory } from "./inventory.ts";
import {
  BEST, CLOSURE_WARNINGS, DROPPED_HITS, FIVE_CALLERS, MODULE_GRAPH, ORDER_CLOSURE, SEVEN_CALLERS, anchors, failSearchOn, hit,
  hitsOf, indexWith, located, request, titlesOf,
} from "./inventory.fixtures.ts";
import { assertEveryIdHasEntry, assertWarns } from "./inventory.assertions.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("buildInventory — the index", () => {
  it("builds the index when it holds no root, then searches", async () => {
    // Arrange
    const index = indexWith({ "Prune entries": [hit(`${WORKSPACE}/src/domain/prune.ts::prune`)] });
    index.roots = 0;
    index.indexed = { files: 12, nodes: 40, edges: 9, statements: 100, errors: [] };

    // Act
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune entries"]]), new FakeLogger());

    // Assert
    ok(r.ok);
    strictEqual(r.inventory.index, "built");
    deepStrictEqual(index.calls.slice(0, 3), ["rootCount", `index ${WORKSPACE}`, "search Prune entries 8"]);
  });

  it("refuses when the index cannot be built", async () => {
    // Arrange
    const index = new FakeCodeIndex();
    index.failure = new Error("store offline\nstack");

    // Act
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());

    // Assert
    deepStrictEqual(r, {
      ok: false,
      text: "dev-plan: the code index cannot be built (store offline): anchors would be guesses, so no plan is written",
    });
  });

  it("answers an empty inventory with a warning when the build indexes no file", async () => {
    // Arrange
    const index = new FakeCodeIndex();

    // Act
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());

    // Assert
    ok(r.ok);
    strictEqual(r.inventory.index, "empty");
    deepStrictEqual(r.inventory.entries, []);
    deepStrictEqual(r.inventory.warnings, ["the code index holds no file: every anchor is a path to create"]);
    deepStrictEqual(index.calls, ["rootCount", `index ${WORKSPACE}`]);
  });
});

describe("buildInventory — the entries", () => {
  it("keeps a symbol once and adds every id whose title found it, in source order", async () => {
    // Arrange
    const shared = hit(`${WORKSPACE}/src/domain/memory.ts::MemoryEntry`, 0.05);
    const index = indexWith({ "Prune old entries": [shared], "Keep feedback": [shared, hit(`${WORKSPACE}/src/domain/feedback.ts::isFeedback`)] });

    // Act
    const r = await buildInventory(index, anchors(), request([["UC-01", "Prune old entries"], ["BR-02", "Keep feedback"]]), new FakeLogger());

    // Assert
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => [e.ref, e.path, e.forIds, e.layer]), [
      ["I1", "src/domain/memory.ts", ["UC-01", "BR-02"], "domain"],
      ["I2", "src/domain/feedback.ts", ["BR-02"], "domain"],
    ]);
    const e = r.inventory.entries[0];
    deepStrictEqual([e.name, e.line, e.endLine, e.fqn], ["MemoryEntry", 3, 8, `${WORKSPACE}/src/domain/memory.ts::MemoryEntry`]);
  });

  it("drops hits under .claude/, the work folder or a build output, and a symbol whose source path is excluded", async () => {
    // Arrange
    const index = indexWith({ Prune: DROPPED_HITS });
    index.sources[`${WORKSPACE}/src/app/reexport.ts::d`] = { ...located(`${WORKSPACE}/src/app/reexport.ts::d`), path: `${WORKSPACE}/.orkeon/gen.ts` };

    // Act
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());

    // Assert
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => [e.ref, e.path]), [["I1", "src/app/run.ts"]]);
    assertWarns(r.inventory.warnings, `${WORKSPACE}/src/app/reexport.ts::d dropped: ${WORKSPACE}/.orkeon/gen.ts is outside what a plan may anchor`);
  });

  it("drops a symbol the index cannot locate, keeping the refs dense", async () => {
    // Arrange
    const index = indexWith({ Prune: [hit(`${WORKSPACE}/src/a.ts::a`), hit(`${WORKSPACE}/src/b.ts::b`), hit(`${WORKSPACE}/src/c.ts::c`)] });
    delete index.sources[`${WORKSPACE}/src/b.ts::b`];

    // Act
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());

    // Assert
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => [e.ref, e.path]), [["I1", "src/a.ts"], ["I2", "src/c.ts"]]);
    assertWarns(r.inventory.warnings, `${WORKSPACE}/src/b.ts::b dropped: no symbol ${WORKSPACE}/src/b.ts::b`);
  });

  it("goes on after a failing search, with a warning", async () => {
    // Arrange
    const index = indexWith({ Second: [hit(`${WORKSPACE}/src/s.ts::s`)] });
    failSearchOn(index, "First");

    // Act
    const r = await buildInventory(index, anchors(), request([["BR-01", "First"], ["BR-02", "Second"]]), new FakeLogger());

    // Assert
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => e.forIds), [["BR-02"]]);
    deepStrictEqual(r.inventory.warnings, ["search failed for BR-01: timeout"]);
  });
});

describe("buildInventory — caps and the round robin", () => {
  it("searches 20 titles of 40, one entry each first, then a second for titles 1 to 4", async () => {
    // Arrange
    const titles = titlesOf(40);
    const index = indexWith(hitsOf(titles, 4));

    // Act
    const r = await buildInventory(index, anchors(), request(titles), new FakeLogger());

    // Assert
    ok(r.ok);
    const inv = r.inventory;
    strictEqual(inv.titlesSearched, 20);
    strictEqual(index.calls.filter((c) => c.startsWith("search ")).length, 20);
    strictEqual(inv.entries.length, 24);
    deepStrictEqual(inv.entries.slice(0, 20).map((e) => e.path), titles.slice(0, 20).map((_, i) => `src/t${i + 1}/h1.ts`));
    deepStrictEqual(inv.entries.slice(20).map((e) => e.path), ["src/t1/h2.ts", "src/t2/h2.ts", "src/t3/h2.ts", "src/t4/h2.ts"]);
    assertEveryIdHasEntry(inv.entries, titles.slice(0, 20).map(([id]) => id));
    ok(inv.warnings[0].startsWith("20 titles not searched: BR-16, BR-17"), inv.warnings[0]);
  });

  it("keeps 3 hits a title at most", async () => {
    // Arrange
    const one = titlesOf(1);

    // Act
    const r1 = await buildInventory(indexWith(hitsOf(one, 4)), anchors(), request(one), new FakeLogger());

    // Assert
    ok(r1.ok);
    deepStrictEqual(r1.inventory.entries.map((e) => e.path), ["src/t1/h1.ts", "src/t1/h2.ts", "src/t1/h3.ts"]);
  });

  it("keeps 24 entries at most", async () => {
    // Arrange
    const many = titlesOf(21);

    // Act
    const r2 = await buildInventory(indexWith(hitsOf(many, 4)), anchors(), request(many), new FakeLogger());

    // Assert
    ok(r2.ok);
    strictEqual(r2.inventory.entries.length, 24);
    strictEqual(r2.inventory.titlesSearched, 20);
    deepStrictEqual(r2.inventory.warnings, ["1 titles not searched: BR-16"]);
  });

  it("asks the closure of the 12 best entries, keeps 5 callers made relative, and joins the module graph", async () => {
    // Arrange
    const titles = titlesOf(20);
    const index = indexWith(hitsOf(titles, 1));
    const anchorIndex = anchors();
    anchorIndex.closures[BEST] = SEVEN_CALLERS;
    index.graph = MODULE_GRAPH;

    // Act
    const r = await buildInventory(index, anchorIndex, request(titles), new FakeLogger());

    // Assert
    ok(r.ok);
    strictEqual(index.calls.some((c) => c.startsWith("impact ")), false);
    strictEqual(anchorIndex.calls.length, 12);
    strictEqual(anchorIndex.calls[0], `closure ${BEST}`);
    const first = r.inventory.entries[0];
    deepStrictEqual(first.callers, FIVE_CALLERS);
    deepStrictEqual(first.imports, ["src/shared/a.ts"]);
    deepStrictEqual(r.inventory.entries[1].imports, ["src/shared/b.ts"]);
    ok(index.calls.includes("dependencyGraph L2_Module 300"));
  });

  it("makes 59 calls at most, and counts each one", async () => {
    // Arrange
    const titles = titlesOf(40);
    const index = indexWith(hitsOf(titles, 8));
    index.roots = 0;
    index.indexed = { files: 3, nodes: 1, edges: 0, statements: 1, errors: [] };
    const anchorIndex = anchors();

    // Act
    const r = await buildInventory(index, anchorIndex, request(titles), new FakeLogger());

    // Assert
    ok(r.ok);
    strictEqual(r.inventory.calls, index.calls.length + anchorIndex.calls.length);
    strictEqual(r.inventory.calls, 59);
    strictEqual(anchorIndex.calls.length, 12);
  });

  it("drops the entry's own subtree from its closure, and only that", async () => {
    // Arrange
    const index = indexWith({ Prune: [hit(`${WORKSPACE}/src/app/order.ts::Order`, 0.09)] });
    const anchorIndex = anchors();
    anchorIndex.closures[`${WORKSPACE}/src/app/order.ts::Order`] = ORDER_CLOSURE;

    // Act
    const r = await buildInventory(index, anchorIndex, request([["BR-01", "Prune"]]), new FakeLogger());

    // Assert
    ok(r.ok);
    deepStrictEqual(r.inventory.entries[0].callers,
      ["src/app/order.ts::OrderLine", "src/app/cart.ts::Cart::checkout", "tests/order.test.ts::adds a line"]);
    deepStrictEqual(r.inventory.warnings, []);
  });

  it("warns on a truncated closure, an anchor batch_anchors does not know, and a failed closure", async () => {
    // Arrange
    const index = indexWith({ Prune: [hit(`${WORKSPACE}/src/a.ts::a`, 0.09), hit(`${WORKSPACE}/src/b.ts::b`, 0.08), hit(`${WORKSPACE}/src/c.ts::c`, 0.07)] });
    const anchorIndex = anchors();
    anchorIndex.closures[`${WORKSPACE}/src/a.ts::a`] = { nodes: [`${WORKSPACE}/src/x.ts::x`], unresolved: [], truncated: true };
    anchorIndex.closures[`${WORKSPACE}/src/b.ts::b`] = { nodes: [], unresolved: [`${WORKSPACE}/src/b.ts::b`], truncated: false };
    anchorIndex.failures[`${WORKSPACE}/src/c.ts::c`] = new Error("store offline\nstack");

    // Act
    const r = await buildInventory(index, anchorIndex, request([["BR-01", "Prune"]]), new FakeLogger());

    // Assert
    ok(r.ok);
    deepStrictEqual(r.inventory.entries.map((e) => e.callers), [["src/x.ts::x"], [], []]);
    deepStrictEqual(r.inventory.warnings, CLOSURE_WARNINGS);
  });

  it("warns when the module graph fails, imports left empty", async () => {
    // Arrange
    const index = indexWith({ Prune: [hit(`${WORKSPACE}/src/a.ts::a`)] });
    index.dependencyGraph = async () => { throw new Error("graph too large"); };

    // Act
    const r = await buildInventory(index, anchors(), request([["BR-01", "Prune"]]), new FakeLogger());

    // Assert
    ok(r.ok);
    deepStrictEqual(r.inventory.entries[0].imports, []);
    deepStrictEqual(r.inventory.warnings, ["the module graph failed: graph too large"]);
  });
});

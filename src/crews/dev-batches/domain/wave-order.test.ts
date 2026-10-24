// The order of a plan's batches: dependencies first, ties by id, a cycle or an unknown dependency
// refused, and the next batch the first one not done. Run:
//   node --test src/crews/dev-batches/domain/wave-order.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { nextBatch, waveOrder } from "./wave-order.ts";
import type { BatchNode } from "./wave-order.ts";

const node = (id: string, dependsOn: string[] = [], done = false): BatchNode => ({ id, dependsOn, done });

describe("waveOrder", () => {
  it("puts each batch after the ones it depends on, ties by id (F2 before F10)", () => {
    deepStrictEqual(waveOrder([node("F10"), node("F3", ["F10"]), node("F2"), node("F1", ["F3"])]),
      { ok: true, order: ["F2", "F10", "F3", "F1"] });
  });

  it("refuses a dependency on a batch the plan does not hold, on itself, or a cycle", () => {
    for (const nodes of [[node("F1", ["F9"])], [node("F1", ["F1"])], [node("F1", ["F2"]), node("F2", ["F1"])]]) {
      const order = waveOrder(nodes);
      strictEqual(order.ok, false);
      ok(!order.ok && order.problem.length > 0);
    }
  });
});

describe("nextBatch", () => {
  it("names the first batch of the order not done, and none when every batch is done", () => {
    const nodes = [node("F1", [], true), node("F2", ["F1"]), node("F3")];
    const order = waveOrder(nodes);
    ok(order.ok);
    strictEqual(nextBatch(order.order, nodes), "F2");
    strictEqual(nextBatch(order.order, nodes.map((n) => ({ ...n, done: true }))), null);
  });
});

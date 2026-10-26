// The order of a plan's batches: dependencies first, ties by id, a cycle or an unknown dependency
// refused, and the next batch the first one not done. Run:
//   node --test tests/crews/dev-batches/domain/wave-order.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { nextBatch, waveOrder } from "../../../../src/crews/dev-batches/domain/wave-order.ts";
import { F1_DONE_PLAN, REFUSED_PLANS, node } from "./wave-order.fixtures.ts";
import { assertRefused } from "./wave-order.assertions.ts";

describe("waveOrder", () => {
  it("puts each batch after the ones it depends on, ties by id (F2 before F10)", () => {
    // Arrange
    const nodes = [node("F10"), node("F3", ["F10"]), node("F2"), node("F1", ["F3"])];

    // Act
    const order = waveOrder(nodes);

    // Assert
    deepStrictEqual(order, { ok: true, order: ["F2", "F10", "F3", "F1"] });
  });

  for (const c of REFUSED_PLANS) {
    it(c.name, () => {
      // Arrange
      const nodes = c.nodes;

      // Act
      const order = waveOrder(nodes);

      // Assert
      assertRefused(order);
    });
  }
});

describe("nextBatch", () => {
  it("names the first batch of the order not done", () => {
    // Arrange
    const order = waveOrder([...F1_DONE_PLAN]);
    ok(order.ok);

    // Act
    const next = nextBatch(order.order, [...F1_DONE_PLAN]);

    // Assert
    strictEqual(next, "F2");
  });

  it("names none when every batch is done", () => {
    // Arrange
    const order = waveOrder([...F1_DONE_PLAN]);
    ok(order.ok);
    const allDone = F1_DONE_PLAN.map((n) => ({ ...n, done: true }));

    // Act
    const next = nextBatch(order.order, allDone);

    // Assert
    strictEqual(next, null);
  });
});

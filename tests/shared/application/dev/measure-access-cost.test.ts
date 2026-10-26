// measureAccessCost over a fake CostIndex: the index as a precondition, the refresh of the
// changed files, the roots and receivers of the pack, the failures. Run:
//   node --test src/shared/application/dev/measure-access-cost.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { COST_NOT_WIRED, DEFAULT_RECEIVERS } from "../../../../src/shared/domain/dev/access-cost.ts";
import { costRoots, measureAccessCost } from "../../../../src/shared/application/dev/measure-access-cost.ts";
import { FakeCostIndex } from "../../../support/doubles/fake-cost-index.ts";
import {
  CHANGED, CHANGED_WITH_COLOCATED_TEST, COST_ROOTS, FAILURES, FS_RECEIVERS, LAYOUT, LIB_ROOTS, LOOP,
  reasonOf,
} from "./measure-access-cost.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("costRoots", () => {
  for (const c of COST_ROOTS) {
    it(`takes ${c.name}`, () => {
      // Arrange
      const { pack } = c;

      // Act
      const roots = costRoots(pack);

      // Assert
      deepStrictEqual(roots, c.roots);
    });
  }
});

describe("measureAccessCost", () => {
  it("is not computed when the crew wires no index", async () => {
    // Arrange
    const index = undefined;

    // Act
    const cost = await measureAccessCost(index, LAYOUT, ["src", "tests"], CHANGED);

    // Assert
    deepStrictEqual(cost, COST_NOT_WIRED);
  });

  it("refreshes then measures the changed production files, flagging a loop on an added line", async () => {
    // Arrange
    const index = new FakeCostIndex();
    index.report = LOOP;

    // Act
    const cost = await measureAccessCost(index, LAYOUT, ["src", "tests"], CHANGED);

    // Assert
    deepStrictEqual(index.calls, ["roots", `refresh ${WORKSPACE} ${WORKSPACE}/src/order.ts`, `accessCost ${WORKSPACE}/src/order.ts`]);
    strictEqual(cost.state === "measured" && cost.exit, 2);
    deepStrictEqual(cost.state === "measured" && cost.flagged, ["src/order.ts::place L5 this.store.save in a loop"]);
  });

  it("says not indexed when the index is empty, and calls neither the refresh nor access_cost", async () => {
    // Arrange
    const index = new FakeCostIndex();
    index.indexed = [];

    // Act
    const cost = await measureAccessCost(index, LAYOUT, ["src"], CHANGED);

    // Assert
    strictEqual(reasonOf(cost).startsWith("not indexed — the code index is empty"), true);
    deepStrictEqual(index.calls, ["roots"]);
  });

  it(`says not indexed when the index holds no ${WORKSPACE} root, and calls neither the refresh nor access_cost`, async () => {
    // Arrange
    const index = new FakeCostIndex();
    index.indexed = ["/elsewhere"];

    // Act
    const cost = await measureAccessCost(index, LAYOUT, ["src"], CHANGED);

    // Assert
    strictEqual(reasonOf(cost).includes(`holds /elsewhere, not ${WORKSPACE}`), true);
    deepStrictEqual(index.calls, ["roots"]);
  });

  it(`measures when the index holds ${WORKSPACE}/, its trailing slash ignored`, async () => {
    // Arrange
    const index = new FakeCostIndex();
    index.indexed = [`${WORKSPACE}/`];

    // Act
    const cost = await measureAccessCost(index, LAYOUT, ["src"], CHANGED);

    // Assert
    strictEqual(reasonOf(cost), "measured exit 0");
  });

  it("measures nothing, with no call, when no changed file is under the pack's roots", async () => {
    // Arrange
    const index = new FakeCostIndex();

    // Act
    const cost = await measureAccessCost(index, LIB_ROOTS, ["src", "tests"], CHANGED);

    // Assert
    strictEqual(cost.state === "measured" && cost.detail, "no changed file under lib\n");
    deepStrictEqual(index.calls, []);
  });

  it("measures every changed file but the tests without roots, a co-located test included", async () => {
    // Arrange
    const index = new FakeCostIndex();

    // Act
    await measureAccessCost(index, null, [], CHANGED_WITH_COLOCATED_TEST);

    // Assert
    strictEqual(index.calls[2], `accessCost ${WORKSPACE}/src/order.ts,${WORKSPACE}/src/tools/run.ts`);
  });

  it("adds the pack's receivers to the default", async () => {
    // Arrange
    const index = new FakeCostIndex();

    // Act
    await measureAccessCost(index, FS_RECEIVERS, ["src"], CHANGED);

    // Assert
    strictEqual(index.calls[2], `accessCost ${WORKSPACE}/src/order.ts (?i)(?:${DEFAULT_RECEIVERS})|(?:_fs)`);
  });

  for (const c of FAILURES) {
    it(`is not computed when ${c.name}`, async () => {
      // Arrange
      const index = new FakeCostIndex();
      c.set(index);

      // Act
      const cost = await measureAccessCost(index, LAYOUT, ["src"], CHANGED);

      // Assert
      strictEqual(reasonOf(cost), c.reason);
    });
  }
});

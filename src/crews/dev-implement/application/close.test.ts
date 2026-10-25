// The close's grouping of the files per layer. Run:
//   node --test src/crews/dev-implement/application/close.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { layersOf, workBranchName } from "./close.ts";
import { BRANCH_CASES, MIXED_LAYERS, MIXED_PATHS, twoLayerPack } from "./close.fixtures.ts";

describe("layersOf", () => {
  it("groups the paths under the pack's roots, the rest last", () => {
    // Arrange
    const pack = twoLayerPack();

    // Act
    const layers = layersOf(pack, [...MIXED_PATHS]);

    // Assert
    deepStrictEqual(layers, MIXED_LAYERS);
  });
});

describe("workBranchName", () => {
  for (const c of BRANCH_CASES) {
    it(c.name, () => {
      // Arrange
      const { pattern, feature } = c;

      // Act
      const name = workBranchName(pattern, "demo", feature);

      // Assert
      strictEqual(name, c.expected);
    });
  }
});

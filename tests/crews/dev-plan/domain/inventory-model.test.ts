// Unit tests for the inventory's pure part: the hits kept, the layer of a path, and the
// lines the planner's prompt shows. Run:
//   node --test tests/crews/dev-plan/domain/inventory-model.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { INVENTORY_CAPS, keepPath, layerOf, renderInventory } from "../../../../src/crews/dev-plan/domain/inventory-model.ts";
import {
  BUILD_OUTPUTS, DESIGN_CAPS, DROPPED_PATHS, EXCLUDED_SPELLINGS, FIRST_LINE, INVENTORY, LONGEST_ROOT, LONG_ENTRY, NO_ROOT,
  SECOND_LINE,
} from "./inventory-model.fixtures.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("INVENTORY_CAPS", () => {
  it("holds the caps of the design", () => {
    // Arrange
    const caps = INVENTORY_CAPS;

    // Act
    const copy = { ...caps };

    // Assert
    deepStrictEqual(copy, DESIGN_CAPS);
  });
});

describe("keepPath", () => {
  it("keeps a repository file as a relative path", () => {
    // Arrange
    const path = `${WORKSPACE}/src/shared/domain/memory.ts`;

    // Act
    const kept = keepPath(path, ["workbench"], []);

    // Assert
    strictEqual(kept, "src/shared/domain/memory.ts");
  });

  for (const p of DROPPED_PATHS) {
    it(`drops a path outside the repository and the folders a plan never anchors: ${p}`, () => {
      // Arrange
      const excluded = ["workbench"];

      // Act
      const kept = keepPath(p, excluded, []);

      // Assert
      strictEqual(kept, null, p);
    });
  }

  for (const c of EXCLUDED_SPELLINGS) {
    it(`reads an excluded folder given relative, absolute or with slashes: ${c.name}`, () => {
      // Arrange
      const { path, excluded, outputs } = c;

      // Act
      const kept = keepPath(path, excluded, outputs);

      // Assert
      strictEqual(kept, c.kept);
    });
  }

  for (const c of BUILD_OUTPUTS) {
    it(`drops a path with a segment named as a build output, not a name that only starts like one: ${c.name}`, () => {
      // Arrange
      const { path, excluded, outputs } = c;

      // Act
      const kept = keepPath(path, excluded, outputs);

      // Assert
      strictEqual(kept, c.kept);
    });
  }
});

describe("layerOf", () => {
  for (const c of LONGEST_ROOT) {
    it(`picks the longest root prefixing the path: ${c.name}`, () => {
      // Arrange
      const { path, layout } = c;

      // Act
      const layer = layerOf(path, layout);

      // Assert
      strictEqual(layer, c.layer);
    });
  }

  for (const c of NO_ROOT) {
    it(`matches whole segments only, and gives other without a root or a layout: ${c.name}`, () => {
      // Arrange
      const { path, layout } = c;

      // Act
      const layer = layerOf(path, layout);

      // Assert
      strictEqual(layer, c.layer);
    });
  }
});

describe("renderInventory", () => {
  it("writes one line per entry, its declaration word, layer, ids, callers and imports", () => {
    // Arrange
    const room = INVENTORY_CAPS.promptChars;

    // Act
    const { text, shown } = renderInventory(INVENTORY, room);

    // Assert
    const lines = text.split("\n");
    strictEqual(lines.length, 5);
    strictEqual(lines[1], SECOND_LINE);
    strictEqual(lines[0], FIRST_LINE);
    deepStrictEqual([...shown], ["I1", "I2", "I3", "I4", "I5"]);
  });

  it("cuts a line at the line cap", () => {
    // Arrange
    const inventory = { ...INVENTORY, entries: [LONG_ENTRY] };

    // Act
    const { text } = renderInventory(inventory, INVENTORY_CAPS.promptChars);

    // Assert
    strictEqual(text.length, INVENTORY_CAPS.lineChars);
  });

  it("counts the entries past the character cap and leaves them out of the shown refs", () => {
    // Arrange
    const first = renderInventory(INVENTORY, 10_000).text.split("\n");
    const room = first[0].length + 1 + first[1].length;

    // Act
    const { text, shown } = renderInventory(INVENTORY, room);

    // Assert
    deepStrictEqual(text.split("\n"), [first[0], first[1], "… 3 entries left out: they cannot be anchors"]);
    deepStrictEqual([...shown], ["I1", "I2"]);
  });

  it("says so when the inventory is empty", () => {
    // Arrange
    const inventory = { ...INVENTORY, entries: [] };

    // Act
    const { text, shown } = renderInventory(inventory, 8_000);

    // Assert
    strictEqual(text, "(the code index holds no symbol for these titles)");
    strictEqual(shown.size, 0);
  });
});

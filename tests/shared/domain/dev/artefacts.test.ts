// Dev artefact names. Run:
//   node --test tests/shared/domain/dev/artefacts.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { classifyArtefact, compareBatchIds, isCode, CODE_PATTERN } from "../../../../src/shared/domain/dev/artefacts.ts";
import { KIND_CASES, OTHER_NAMES, PLAIN_CODES, REFUSED_CODES, SORTED_IDS, UNSORTED_IDS } from "./artefacts.fixtures.ts";

describe("classifyArtefact", () => {
  for (const c of KIND_CASES) {
    it(`names ${c.name}, with its prefix and batch`, () => {
      // Arrange
      const { file } = c;

      // Act
      const result = classifyArtefact(file);

      // Assert
      deepStrictEqual(result, c.expected);
    });
  }

  it("reads DEMO-PLAN-F1.md as a sheet, never as a plan", () => {
    // Arrange
    const file = "DEMO-PLAN-F1.md";

    // Act
    const result = classifyArtefact(file);

    // Assert
    deepStrictEqual(result, { kind: "sheet", name: "DEMO-PLAN-F1.md", prefix: "DEMO", batch: "F1" });
  });

  for (const n of OTHER_NAMES) {
    it(`returns null for anything else: ${n}`, () => {
      // Arrange
      const file = n;

      // Act
      const result = classifyArtefact(file);

      // Assert
      strictEqual(result, null, n);
    });
  }
});

describe("isCode", () => {
  for (const c of PLAIN_CODES) {
    it(`accepts the plain folder name ${JSON.stringify(c)}`, () => {
      // Arrange
      const code = c;

      // Act
      const result = isCode(code);

      // Assert
      strictEqual(result, true, c);
    });
  }

  for (const c of REFUSED_CODES) {
    it(`refuses paths, a leading dash and a double dot: ${JSON.stringify(c)}`, () => {
      // Arrange
      const code = c;

      // Act
      const result = isCode(code);

      // Assert
      strictEqual(result, false, c);
    });
  }

  it("exports the pattern it applies", () => {
    // Arrange
    const code = "a..b";

    // Act
    const result = CODE_PATTERN.test(code);

    // Assert
    strictEqual(result, true); // the pattern alone lets it through; isCode does not
  });
});

describe("compareBatchIds", () => {
  it("orders by number, F2 before F10, non-F ids last by text", () => {
    // Arrange
    const ids = [...UNSORTED_IDS];

    // Act
    const sorted = ids.sort(compareBatchIds);

    // Assert
    deepStrictEqual(sorted, SORTED_IDS);
  });

  it("puts F2 before F10", () => {
    // Arrange
    const [a, b] = ["F2", "F10"];

    // Act
    const order = compareBatchIds(a, b);

    // Assert
    strictEqual(order < 0, true);
  });

  it("finds an id equal to itself", () => {
    // Arrange
    const id = "F3";

    // Act
    const order = compareBatchIds(id, id);

    // Assert
    strictEqual(order, 0);
  });
});

// Unit tests for severity ordering + dedup/rank. Run:
//   node --test tests/shared/domain/severity.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { severityRank, findingDedupKey, dedupAndRank } from "../../../src/shared/domain/severity.ts";
import { f, LENSES_WITH_DUPLICATE, RANK_ORDER } from "./severity.fixtures.ts";

describe("severityRank", () => {
  for (const c of RANK_ORDER) {
    it(`orders blocker<high<medium<low<nit: ${c.first} before ${c.second}`, () => {
      // Arrange
      const pair = [c.first, c.second];

      // Act
      const [first, second] = pair.map((s) => severityRank(s));

      // Assert
      strictEqual(first < second, true);
    });
  }

  it("is case-insensitive", () => {
    // Arrange
    const pair = ["HIGH", "high"];

    // Act
    const [upper, lower] = pair.map((s) => severityRank(s));

    // Assert
    strictEqual(upper, lower);
  });

  it("sorts unknown severities last", () => {
    // Arrange
    const pair = ["weird", "nit"];

    // Act
    const [unknown, nit] = pair.map((s) => severityRank(s));

    // Assert
    strictEqual(unknown > nit, true);
  });
});

describe("findingDedupKey", () => {
  it("keys on file+line+first40 of finding", () => {
    // Arrange
    const finding = f({ file: "x.ts", line: 9, finding: "boom" });

    // Act
    const key = findingDedupKey(finding);

    // Assert
    strictEqual(key, "x.ts:9:boom");
  });
});

describe("dedupAndRank", () => {
  it("drops duplicates across lenses and ranks by severity", () => {
    // Arrange
    const lenses = LENSES_WITH_DUPLICATE;

    // Act
    const out = dedupAndRank(lenses);

    // Assert
    strictEqual(out.length, 2);
    strictEqual(out[0].severity, "blocker");          // ranked first
    strictEqual(out[1].finding, "naming");
  });

  it("attaches the surfacing lens", () => {
    // Arrange
    const lenses = [{ lens: "security", findings: [f({})] }];

    // Act
    const out = dedupAndRank(lenses);

    // Assert
    strictEqual(out[0].lens, "security");
  });

  it("returns [] for no findings", () => {
    // Arrange
    const lenses = [{ lens: "x", findings: [] }];

    // Act
    const out = dedupAndRank(lenses);

    // Assert
    deepStrictEqual(out, []);
  });
});

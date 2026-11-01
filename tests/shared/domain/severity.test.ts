// Unit tests for severity ordering + dedup/rank. Run:
//   node --test tests/shared/domain/severity.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { severityRank, findingDedupKey, dedupAndRank } from "../../../src/shared/domain/severity.ts";
import {
  f, LENSES_WITH_DUPLICATE, LOW_THEN_BLOCKER_ON_ONE_KEY, RANK_ORDER, TIE_ON_ONE_KEY,
  TWO_CATEGORIES_ON_ONE_LINE, TWO_CLAIMS_ON_ONE_LINE,
} from "./severity.fixtures.ts";

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
  it("keys on the file, the line, the lower-cased category and the claim", () => {
    // Arrange
    const finding = f({ file: "x.ts", line: 9, category: "Injection", finding: "Boom" });

    // Act
    const key = findingDedupKey(finding);

    // Assert
    strictEqual(key, "x.ts:9:injection:boom");
  });

  it("keys a finding without a category on its file, line and claim", () => {
    // Arrange
    const finding = f({ file: "x.ts", line: 9, finding: "boom" });

    // Act
    const key = findingDedupKey(finding);

    // Assert
    strictEqual(key, "x.ts:9::boom");
  });

  it("keeps the first 40 characters of the claim", () => {
    // Arrange
    const finding = f({ file: "x.ts", line: 9, finding: `${"a".repeat(40)}tail` });

    // Act
    const key = findingDedupKey(finding);

    // Assert
    strictEqual(key, `x.ts:9::${"a".repeat(40)}`);
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

  it("keeps the most severe finding when two share a file, line, category and claim opening", () => {
    // Arrange
    const lenses = LOW_THEN_BLOCKER_ON_ONE_KEY;

    // Act
    const out = dedupAndRank(lenses);

    // Assert
    deepStrictEqual(out.map((x) => [x.severity, x.lens]), [["blocker", "security"]]);
  });

  it("keeps two findings on one line when their categories differ", () => {
    // Arrange
    const lenses = TWO_CATEGORIES_ON_ONE_LINE;

    // Act
    const out = dedupAndRank(lenses);

    // Assert
    deepStrictEqual(out.map((x) => x.category), ["null-check", "injection"]);
  });

  it("keeps two findings of one category on one line with different claims", () => {
    // Arrange
    const lenses = TWO_CLAIMS_ON_ONE_LINE;

    // Act
    const out = dedupAndRank(lenses);

    // Assert
    strictEqual(out.length, 2);
  });

  it("keeps the first finding on a severity tie", () => {
    // Arrange
    const lenses = TIE_ON_ONE_KEY;

    // Act
    const out = dedupAndRank(lenses);

    // Assert
    deepStrictEqual(out.map((x) => x.lens), ["correctness"]);
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

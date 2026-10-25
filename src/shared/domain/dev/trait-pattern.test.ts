// Unit tests for the trait marker of tests.rule_trait and tests.trait_pattern. Run:
//   node --test src/shared/domain/dev/trait-pattern.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  DEFAULT_TRAIT_PATTERN, SHEET_ID_SOURCE, idsInMatch, ruleTraitProblem, traitMarker, traitPatternProblem,
} from "./trait-pattern.ts";
import {
  ACCEPTED_PATTERNS, MATCH_PART_HITS, NO_MARKER, REFUSED_PATTERNS, TRAIT_NAMES,
} from "./trait-pattern.fixtures.ts";

describe("traitMarker", () => {
  it("compiles the default pattern to the gate's regular expression, byte for byte", () => {
    // Arrange
    const name = "BR";

    // Act
    const m = traitMarker(name, undefined);

    // Assert
    deepStrictEqual(m, {
      pattern: DEFAULT_TRAIT_PATTERN,
      name: "BR",
      ere: '\\[Trait\\("BR", *"[BCU][CHR]-[0-9]+"\\)\\]',
      shown: '[Trait("BR", "<id>")]',
    });
  });

  it("compiles the Node example: a run of spaces becomes ' *'", () => {
    // Arrange
    const pattern = "// <name>:   <id>";

    // Act
    const m = traitMarker("rule", pattern);

    // Assert
    strictEqual(m?.ere, "// *rule: *[BCU][CHR]-[0-9]+");
    strictEqual(m?.shown, "// rule:   <id>");
    strictEqual(new RegExp(m!.ere).test("  // rule: BR-04"), true);
  });

  it("holds no '|', which the runtime's shell refuses even quoted, and matches a sheet id", () => {
    // Arrange
    const name = "BR";

    // Act
    const m = traitMarker(name, undefined)!;

    // Assert
    strictEqual(m.ere.includes("|"), false);
    strictEqual(new RegExp(m.ere).test('[Trait("BR", "UC-12")]'), true);
  });

  it("carries only sheet ids: an id of another family in the marker is not read", () => {
    // Arrange
    const hit = 't.cs:4:[Trait("BR", "BH-1")]';

    // Act
    const ids = idsInMatch(hit);

    // Assert
    deepStrictEqual(ids, []);
  });

  it("escapes every special character of an ERE", () => {
    // Arrange
    const pattern = "@x.y*+?{}|^$ <id>";

    // Act
    const m = traitMarker(undefined, pattern);

    // Assert
    strictEqual(m?.ere, "@x\\.y\\*\\+\\?\\{\\}\\|\\^\\$ *[BCU][CHR]-[0-9]+");
  });

  it("uses trait_pattern without rule_trait when it holds no <name>", () => {
    // Arrange
    const pattern = "rule <id>";

    // Act
    const m = traitMarker(undefined, pattern);

    // Assert
    deepStrictEqual(m, { pattern: "rule <id>", name: null, ere: "rule *[BCU][CHR]-[0-9]+", shown: "rule <id>" });
  });

  for (const c of NO_MARKER) {
    it(`is null ${c.name}`, () => {
      // Arrange
      const { ruleTrait, traitPattern } = c;

      // Act
      const m = traitMarker(ruleTrait, traitPattern);

      // Assert
      strictEqual(m, null);
    });
  }
});

describe("traitPatternProblem", () => {
  for (const c of REFUSED_PATTERNS) {
    it(`refuses ${JSON.stringify(c.pattern)}: ${c.message}`, () => {
      // Arrange
      const { pattern } = c;

      // Act
      const problem = traitPatternProblem(pattern);

      // Assert
      strictEqual(problem, c.message);
    });
  }

  for (const pattern of ACCEPTED_PATTERNS) {
    it(`accepts the default pattern, the Node example and 80 characters: ${JSON.stringify(pattern)}`, () => {
      // Arrange
      const candidate = pattern;

      // Act
      const problem = traitPatternProblem(candidate);

      // Assert
      strictEqual(problem, undefined);
    });
  }
});

describe("ruleTraitProblem", () => {
  for (const c of TRAIT_NAMES) {
    it(`takes letters, digits, '_' and '-': ${JSON.stringify(c.name)}`, () => {
      // Arrange
      const { name } = c;

      // Act
      const problem = ruleTraitProblem(name);

      // Assert
      strictEqual(problem, c.problem);
    });
  }
});

describe("idsInMatch", () => {
  for (const c of MATCH_PART_HITS) {
    it(`reads whole-token ids of the match part only: ${c.hit}`, () => {
      // Arrange
      const { hit } = c;

      // Act
      const ids = idsInMatch(hit);

      // Assert
      deepStrictEqual(ids, c.ids);
    });
  }

  it("does not read BR-1 in BR-10", () => {
    // Arrange
    const hit = "a:1:BR-10";

    // Act
    const ids = idsInMatch(hit);

    // Assert
    strictEqual(ids.includes("BR-1"), false);
  });

  it("does not read an id glued to a letter", () => {
    // Arrange
    const hit = "a:1:XBR-02 UC-3, CH-04";

    // Act
    const ids = idsInMatch(hit);

    // Assert
    deepStrictEqual(ids, ["UC-3", "CH-04"]);
  });

  it("gives nothing for a line without a match part", () => {
    // Arrange
    const hit = "BR-01";

    // Act
    const ids = idsInMatch(hit);

    // Assert
    deepStrictEqual(ids, []);
  });
});

describe("SHEET_ID_SOURCE", () => {
  it("finds the whole-token sheet ids", () => {
    // Arrange
    const text = "BR-01, UC-2 XCH-3";

    // Act
    const ids = text.match(new RegExp(SHEET_ID_SOURCE, "g"));

    // Assert
    deepStrictEqual(ids, ["BR-01", "UC-2"]);
  });
});

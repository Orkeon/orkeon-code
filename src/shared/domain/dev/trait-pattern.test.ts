// Unit tests for the trait marker of tests.rule_trait and tests.trait_pattern. Run:
//   node --test src/shared/domain/dev/trait-pattern.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  DEFAULT_TRAIT_PATTERN, SHEET_ID_SOURCE, idsInMatch, ruleTraitProblem, traitMarker, traitPatternProblem,
} from "./trait-pattern.ts";

describe("traitMarker", () => {
  it("compiles the default pattern to the gate's regular expression, byte for byte", () => {
    deepStrictEqual(traitMarker("BR", undefined), {
      pattern: DEFAULT_TRAIT_PATTERN,
      name: "BR",
      ere: '\\[Trait\\("BR", *"[BCU][CHR]-[0-9]+"\\)\\]',
      shown: '[Trait("BR", "<id>")]',
    });
  });
  it("compiles the Node example: a run of spaces becomes ' *'", () => {
    const m = traitMarker("rule", "// <name>:   <id>");
    strictEqual(m?.ere, "// *rule: *[BCU][CHR]-[0-9]+");
    strictEqual(m?.shown, "// rule:   <id>");
    strictEqual(new RegExp(m!.ere).test("  // rule: BR-04"), true);
  });
  it("holds no '|', which the runtime's shell refuses even quoted, and carries only sheet ids", () => {
    const m = traitMarker("BR", undefined)!;
    strictEqual(m.ere.includes("|"), false);
    strictEqual(new RegExp(m.ere).test('[Trait("BR", "UC-12")]'), true);
    deepStrictEqual(idsInMatch('t.cs:4:[Trait("BR", "BH-1")]'), []);
  });
  it("escapes every special character of an ERE", () => {
    strictEqual(traitMarker(undefined, "@x.y*+?{}|^$ <id>")?.ere, "@x\\.y\\*\\+\\?\\{\\}\\|\\^\\$ *[BCU][CHR]-[0-9]+");
  });
  it("uses trait_pattern without rule_trait when it holds no <name>", () => {
    deepStrictEqual(traitMarker(undefined, "rule <id>"),
      { pattern: "rule <id>", name: null, ere: "rule *[BCU][CHR]-[0-9]+", shown: "rule <id>" });
  });
  it("is null with neither key, and with <name> but no rule_trait", () => {
    strictEqual(traitMarker(undefined, undefined), null);
    strictEqual(traitMarker(undefined, "// <name>: <id>"), null);
  });
});

describe("traitPatternProblem", () => {
  const cases: Array<[string, string]> = [
    ["   ", "the pattern is empty"],
    [`${"x".repeat(78)}<id>`, "the pattern is longer than 80 characters"],
    ["a\t<id>", "a tab or a line break is not allowed"],
    ["a\n<id>", "a tab or a line break is not allowed"],
    ["'<id>'", "a single quote is not allowed"],
    ["a|b <id>", "a '|' is not allowed: the runtime's shell refuses it"],
    ["rule BR-01", "the pattern must hold <id> exactly once"],
    ["<id> <id>", "the pattern must hold <id> exactly once"],
    ["<name> <name> <id>", "the pattern may hold <name> once at most"],
    ["<x> <id>", "'<' and '>' may only enclose <id> and <name>"],
    ["# <id>", "the pattern needs at least two characters around <id>"],
    ["<name> <id>", "the pattern needs at least two characters around <id>"],
  ];
  for (const [pattern, message] of cases) {
    it(`refuses ${JSON.stringify(pattern)}: ${message}`, () => strictEqual(traitPatternProblem(pattern), message));
  }
  it("accepts the default pattern, the Node example and 80 characters", () => {
    strictEqual(traitPatternProblem(DEFAULT_TRAIT_PATTERN), undefined);
    strictEqual(traitPatternProblem("// <name>: <id>"), undefined);
    strictEqual(traitPatternProblem(`${"x".repeat(76)}<id>`), undefined);
  });
});

describe("ruleTraitProblem", () => {
  it("takes letters, digits, '_' and '-'", () => {
    strictEqual(ruleTraitProblem("BR_rule-2"), undefined);
    strictEqual(ruleTraitProblem("B R"), "a trait name takes letters, digits, '_' and '-'");
    strictEqual(ruleTraitProblem(""), "a trait name takes letters, digits, '_' and '-'");
  });
});

describe("idsInMatch", () => {
  it("reads whole-token ids of the match part only", () => {
    deepStrictEqual(idsInMatch('tests/BR-07/A.cs:12:[Trait("BR", "BR-10")]'), ["BR-10"]);
    deepStrictEqual(idsInMatch("a.ts:3:// rule: BR-1"), ["BR-1"]);
  });
  it("does not read BR-1 in BR-10 nor an id glued to a letter", () => {
    strictEqual(idsInMatch("a:1:BR-10").includes("BR-1"), false);
    deepStrictEqual(idsInMatch("a:1:XBR-02 UC-3, CH-04"), ["UC-3", "CH-04"]);
  });
  it("gives nothing for a line without a match part", () => deepStrictEqual(idsInMatch("BR-01"), []));
});

describe("SHEET_ID_SOURCE", () => {
  it("finds the whole-token sheet ids", () => {
    deepStrictEqual("BR-01, UC-2 XCH-3".match(new RegExp(SHEET_ID_SOURCE, "g")), ["BR-01", "UC-2"]);
  });
});

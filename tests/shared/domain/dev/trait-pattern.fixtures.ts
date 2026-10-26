// Patterns, trait names and grep hits the trait marker is tested on.
import { DEFAULT_TRAIT_PATTERN } from "../../../../src/shared/domain/dev/trait-pattern.ts";

export interface NoMarkerCase {
  name: string;
  ruleTrait: string | undefined;
  traitPattern: string | undefined;
}

export const NO_MARKER: readonly NoMarkerCase[] = [
  { name: "with neither key", ruleTrait: undefined, traitPattern: undefined },
  { name: "with <name> but no rule_trait", ruleTrait: undefined, traitPattern: "// <name>: <id>" },
];

export interface PatternCase {
  pattern: string;
  message: string;
}

/** Each refused pattern and the problem it is refused with. */
export const REFUSED_PATTERNS: readonly PatternCase[] = [
  { pattern: "   ", message: "the pattern is empty" },
  { pattern: `${"x".repeat(78)}<id>`, message: "the pattern is longer than 80 characters" },
  { pattern: "a\t<id>", message: "a tab or a line break is not allowed" },
  { pattern: "a\n<id>", message: "a tab or a line break is not allowed" },
  { pattern: "'<id>'", message: "a single quote is not allowed" },
  { pattern: "a|b <id>", message: "a '|' is not allowed: the runtime's shell refuses it" },
  { pattern: "rule BR-01", message: "the pattern must hold <id> exactly once" },
  { pattern: "<id> <id>", message: "the pattern must hold <id> exactly once" },
  { pattern: "<name> <name> <id>", message: "the pattern may hold <name> once at most" },
  { pattern: "<x> <id>", message: "'<' and '>' may only enclose <id> and <name>" },
  { pattern: "# <id>", message: "the pattern needs at least two characters around <id>" },
  { pattern: "<name> <id>", message: "the pattern needs at least two characters around <id>" },
];

/** The default pattern, the Node example and a pattern of 80 characters. */
export const ACCEPTED_PATTERNS: readonly string[] = [DEFAULT_TRAIT_PATTERN, "// <name>: <id>", `${"x".repeat(76)}<id>`];

export interface TraitNameCase {
  name: string;
  problem: string | undefined;
}

export const TRAIT_NAMES: readonly TraitNameCase[] = [
  { name: "BR_rule-2", problem: undefined },
  { name: "B R", problem: "a trait name takes letters, digits, '_' and '-'" },
  { name: "", problem: "a trait name takes letters, digits, '_' and '-'" },
];

export interface HitCase {
  hit: string;
  ids: string[];
}

/** Hits whose path holds an id the match part does not, and a Node marker. */
export const MATCH_PART_HITS: readonly HitCase[] = [
  { hit: 'tests/BR-07/A.cs:12:[Trait("BR", "BR-10")]', ids: ["BR-10"] },
  { hit: "a.ts:3:// rule: BR-1", ids: ["BR-1"] },
];

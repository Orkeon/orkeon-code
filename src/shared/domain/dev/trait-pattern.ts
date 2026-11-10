// The trait marker: how a test says which sheet id it covers. The repository pack gives
// a trait name (tests.rule_trait) and, optionally, a one-line pattern (tests.trait_pattern)
// holding <id> once and <name> at most once; the pattern compiles to the POSIX ERE that
// git grep -E runs over the test roots. Pure.
import {
  PATTERN_ANGLES, PATTERN_EMPTY, PATTERN_NO_PIPE, PATTERN_NO_SINGLE_QUOTE, PATTERN_NO_TAB_OR_BREAK, PATTERN_ONE_ID,
  PATTERN_ONE_NAME, PATTERN_TOO_LONG, PATTERN_TOO_SHORT, TRAIT_NAME_CHARS,
} from "./messages.ts";

export const DEFAULT_TRAIT_PATTERN = '[Trait("<name>", "<id>")]';
/** The sheet ids the gate checks (AC:166). */
export const SHEET_ID_SOURCE = "\\b(BR|UC|CH)-[0-9]+\\b";

// No alternation: the runtime's shell tool refuses a '|' even quoted, so the ERE
// over-matches (BH-1, UR-2) and idsInMatch keeps the sheet ids alone.
const ID_ERE = "[BCU][CHR]-[0-9]+";
const ID_TOKEN = "<id>";
const NAME_TOKEN = "<name>";
const ERE_SPECIALS = new Set([..."\\.[]()*+?{}|^$"]);

export interface TraitMarker {
  pattern: string;      // the pattern used (trait_pattern, else the default)
  name: string | null;  // tests.rule_trait
  ere: string;          // the POSIX ERE handed to git grep -E
  shown: string;        // the pattern with <name> replaced, <id> kept: [Trait("BR", "<id>")]
}

function count(text: string, token: string): number {
  return text.split(token).length - 1;
}

export function ruleTraitProblem(name: string): string | undefined {
  return /^[A-Za-z0-9_-]+$/.test(name) ? undefined : TRAIT_NAME_CHARS;
}

export function traitPatternProblem(pattern: string): string | undefined {
  if (pattern.trim() === "") return PATTERN_EMPTY;
  if (pattern.length > 80) return PATTERN_TOO_LONG;
  if (/[\t\r\n]/.test(pattern)) return PATTERN_NO_TAB_OR_BREAK;
  if (pattern.includes("'")) return PATTERN_NO_SINGLE_QUOTE;
  if (pattern.includes("|")) return PATTERN_NO_PIPE;
  if (count(pattern, ID_TOKEN) !== 1) return PATTERN_ONE_ID;
  if (count(pattern, NAME_TOKEN) > 1) return PATTERN_ONE_NAME;
  const rest = pattern.split(ID_TOKEN).join("").split(NAME_TOKEN).join("");
  if (/[<>]/.test(rest)) return PATTERN_ANGLES;
  if (rest.replace(/\s/g, "").length < 2) return PATTERN_TOO_SHORT;
  return undefined;
}

function compile(pattern: string, name: string | null): string {
  let ere = "";
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith(ID_TOKEN, i)) { ere += ID_ERE; i += ID_TOKEN.length; continue; }
    if (pattern.startsWith(NAME_TOKEN, i)) { ere += name ?? ""; i += NAME_TOKEN.length; continue; }
    const c = pattern[i];
    if (c === " ") {
      while (pattern[i] === " ") i++;
      ere += " *";
      continue;
    }
    ere += ERE_SPECIALS.has(c) ? `\\${c}` : c;
    i++;
  }
  return ere;
}

/** null when no marker applies: no rule_trait and no trait_pattern, or <name> in the pattern without rule_trait. */
export function traitMarker(ruleTrait: string | undefined, traitPattern: string | undefined): TraitMarker | null {
  const pattern = traitPattern ?? (ruleTrait !== undefined ? DEFAULT_TRAIT_PATTERN : undefined);
  if (pattern === undefined) return null;
  if (pattern.includes(NAME_TOKEN) && ruleTrait === undefined) return null;
  const name = ruleTrait ?? null;
  return { pattern, name, ere: compile(pattern, name), shown: pattern.split(NAME_TOKEN).join(name ?? "") };
}

/** Ids carried by one git grep hit `path:line:match`: whole-token ids of the match part. */
export function idsInMatch(hit: string): string[] {
  const first = hit.indexOf(":");
  const second = first < 0 ? -1 : hit.indexOf(":", first + 1);
  if (second < 0) return [];
  const ids: string[] = [];
  for (const m of hit.slice(second + 1).matchAll(/(^|[^0-9A-Za-z])((BR|UC|CH)-[0-9]+)(?![0-9])/g)) {
    if (!ids.includes(m[2])) ids.push(m[2]);
  }
  return ids;
}

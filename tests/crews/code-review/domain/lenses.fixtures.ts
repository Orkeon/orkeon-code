// Settings the lens selection is read from, for the selectLenses tests.
import type { Finding } from "../../../../src/shared/domain/types.ts";

/** A `review.lenses` setting that names no lens: each must select all three. */
export const UNSET_SETTINGS: readonly { name: string; value: string | null | undefined }[] = [
  { name: "undefined", value: undefined },
  { name: "null", value: null },
  { name: "empty", value: "" },
  { name: "blank", value: "   " },
  { name: "only commas", value: ",," },
];

/** What each lens's own scale, bar or hunt must say: `field` of lens `key` holds every one of `mentions`. */
export const LENS_RULE_MARKERS: readonly {
  name: string;
  key: string;
  field: "looksFor" | "leaves" | "severities" | "bar";
  mentions: readonly string[];
}[] = [
  {
    name: "ranks a security finding by what an attacker needs",
    key: "security",
    field: "severities",
    mentions: ["by what an attacker needs", "blocker (no condition", "high (open under specific conditions",
      "medium (a defence missing on a path the diff shows an input reaching, with no way in shown)"],
  },
  {
    name: "leaves a defence wished for code the diff does not touch",
    key: "security",
    field: "leaves",
    mentions: ["a defence wished for code the diff does not touch"],
  },
  {
    name: "asks a security finding for the input an attacker controls",
    key: "security",
    field: "bar",
    mentions: ["the input an attacker controls"],
  },
  {
    name: "caps a style finding at medium",
    key: "style",
    field: "severities",
    mentions: ["never above medium", "medium (", "low (", "nit ("],
  },
  {
    name: "holds a style finding to a convention or neighbouring code it can quote",
    key: "style",
    field: "bar",
    mentions: ["quote the convention the project states, or the neighbouring code", "what it costs a reader or maintainer"],
  },
  {
    name: "has the correctness lens check what each removed line guaranteed",
    key: "correctness",
    field: "looksFor",
    mentions: [
      "for each removed or replaced line, what it guaranteed and whether the new code still does",
      "points at the first new line of the hunk that held the removed line, the new start its @@ header gives, and names the removed line",
    ],
  },
  {
    name: "keeps the input-or-state bar for the correctness lens",
    key: "correctness",
    field: "bar",
    mentions: ["say what goes wrong, for which input or state"],
  },
  {
    name: "keeps every level of the scale the report ranks by for the correctness lens",
    key: "correctness",
    field: "severities",
    mentions: ["blocker (", "high (", "medium (", "low (", "nit ("],
  },
];

/** A finding of `severity` with defaults. */
const finding = (severity: string): Finding => ({ severity, file: "a.ts", line: 1, finding: "x" });

/** What each lens keeps of a finding's severity: style comes down to its ceiling, the others keep theirs. */
export const CEILING_CASES: readonly { name: string; key: string; given: Finding; severity: string }[] = [
  { name: "brings a style blocker down to medium", key: "style", given: finding("blocker"), severity: "medium" },
  { name: "brings a style high down to medium", key: "style", given: finding("high"), severity: "medium" },
  { name: "keeps a style low", key: "style", given: finding("low"), severity: "low" },
  { name: "keeps a correctness blocker", key: "correctness", given: finding("blocker"), severity: "blocker" },
  { name: "keeps a security high", key: "security", given: finding("high"), severity: "high" },
];

// The answers checkLearnAnswer is tested on: a valid motif on the wire, the rows shown to the model, and one case per
// refusal of the design's table.
import {
  LABEL_TITLE_CHARS, MAX_LINES_PER_MOTIF, MAX_TOPIC_CHARS, SEEN_LINES_ONLY, checkLearnAnswer, motifLabel,
} from "../../../../src/crews/dev-learn/domain/learn-answer.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const SHOWN = new Set(["c936075d95", "b983faad38", "3a59a45e69", "7b3b561c93"]);

/** A valid motif as the model sends it (snake_case, its title padded), its fields overridden by `over`. */
export const motif = (over: Record<string, unknown> = {}) => ({
  title: " Refusal paths go untested ", topic: "refusal-tests", rows: ["c936075d95", "b983faad38", "3a59a45e69"],
  preventive_line: "Each refusal text of a command has a test that triggers it.",
  owner_kind: "repository", owner_path: "CONTRIBUTING.md", check: "test", status: "new",
  lines_added: ["Every refusal a command prints has a test that makes it print."],
  novelty: "the guide names no refusal test", key_term: "refusal",
  ...over,
});

/** The problems checkLearnAnswer finds in `value` given with owner lines (unless `ownerLinesShown` is false), none
 *  when it passes. */
export const problemsOf = (value: unknown, ownerLinesShown = true): string[] => {
  const r = checkLearnAnswer(value, SHOWN, ownerLinesShown);
  return r.ok ? [] : r.problems;
};

/** The motif() mapped to camelCase, trimmed, its left-out lists filled. */
export const MAPPED_ANSWER = {
  motifs: [{
    title: "Refusal paths go untested", topic: "refusal-tests", rows: ["c936075d95", "b983faad38", "3a59a45e69"],
    preventiveLine: "Each refusal text of a command has a test that triggers it.",
    owner: { kind: "repository", path: "CONTRIBUTING.md" }, check: "test", status: "new",
    linesRemoved: [], linesAdded: ["Every refusal a command prints has a test that makes it print."],
    novelty: "the guide names no refusal test", keyTerm: "refusal",
  }],
  dropped: [],
};

/** An answer with a harness owner refining a line, and one item the model dropped. */
export const HARNESS_OWNER_ANSWER = {
  motifs: [motif({
    owner_kind: "harness", owner_path: ".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
    status: "refines", lines_removed: ["Old line."],
  })],
  dropped: [{ title: "Vague", filter: "prevention", reason: "a reminder stops nothing" }],
};

export interface AnswerCase {
  name: string;
  value: unknown;
  problem: string;
}

/** Answers refused as a whole. */
export const ANSWER_CASES: readonly AnswerCase[] = [
  { name: "not an object", value: [1], problem: "the answer is not an object" },
  { name: "motifs not a list", value: { motifs: "x" }, problem: "motifs must be a list" },
  { name: "more than 3 motifs", value: { motifs: [motif(), motif(), motif(), motif()] }, problem: "at most 3 motifs, not 4" },
];

export interface MotifCase {
  name: string;
  /** The fields of motif() the case overrides. */
  over: Record<string, unknown>;
  problem: string;
}

/** How the problems name motif() as the first motif of an answer. */
export const AT = motifLabel(1, "Refusal paths go untested");
/** What a motif of status new, refines or replaces must hold, and what a removes motif must. */
const ADDS = `1 to ${MAX_LINES_PER_MOTIF} lines added and at most ${MAX_LINES_PER_MOTIF} removed`;
const REMOVES = `removes takes out 1 to ${MAX_LINES_PER_MOTIF} lines and adds none`;
const SIX = ["a", "b", "c", "d", "e", "f"];

/** One motif refused, by the field that breaks it. */
export const MOTIF_CASES: readonly MotifCase[] = [
  { name: "empty title", over: { title: "  " }, problem: "motif 1: title must be 1 to 80 characters" },
  { name: "title over 80", over: { title: "x".repeat(81) }, problem: `${motifLabel(1, "x".repeat(81))}: title must be 1 to 80 characters` },
  { name: "topic not a slug", over: { topic: "Refusal Tests" }, problem: `${AT}: topic 'Refusal Tests' is not a kebab slug of at most ${MAX_TOPIC_CHARS} characters` },
  { name: "topic over its limit", over: { topic: "a".repeat(MAX_TOPIC_CHARS + 1) }, problem: `${AT}: topic '${"a".repeat(MAX_TOPIC_CHARS + 1)}' is not a kebab slug of at most ${MAX_TOPIC_CHARS} characters` },
  { name: "rows empty", over: { rows: [] }, problem: `${AT}: rows is empty` },
  { name: "row not shown", over: { rows: ["abc"] }, problem: `${AT}: row 'abc' is not one of the rows given` },
  { name: "row twice", over: { rows: ["c936075d95", "c936075d95"] }, problem: `${AT}: row 'c936075d95' is listed twice` },
  { name: "empty preventive line", over: { preventive_line: "" }, problem: `${AT}: preventive_line is empty` },
  { name: "empty novelty", over: { novelty: " " }, problem: `${AT}: novelty is empty` },
  { name: "empty key term", over: { key_term: "" }, problem: `${AT}: key_term is empty` },
  { name: "absolute owner path", over: { owner_path: `${WORKSPACE}/CONTRIBUTING.md` }, problem: `${AT}: owner_path '${WORKSPACE}/CONTRIBUTING.md' is not a relative path` },
  { name: "owner path with ..", over: { owner_path: "docs/../x.md" }, problem: `${AT}: owner_path 'docs/../x.md' is not a relative path` },
  { name: "owner path with a backslash", over: { owner_path: "docs\\x.md" }, problem: `${AT}: owner_path 'docs\\x.md' is not a relative path` },
  { name: "owner path with an edge space", over: { owner_path: " x.md" }, problem: `${AT}: owner_path ' x.md' is not a relative path` },
  {
    name: "repository owner under .claude/", over: { owner_path: ".claude/rules/x.md" },
    problem: `${AT}: .claude/ is the harness's deployed copy: name the orkeon-workshop file with owner_kind harness`,
  },
  {
    name: "harness owner outside the packs", over: { owner_kind: "harness", owner_path: "CONTRIBUTING.md" },
    problem: `${AT}: a harness owner is a file of the orkeon-workshop repository under .devcontainer/harness/packs/`,
  },
  { name: "no line added", over: { lines_added: [] }, problem: `${AT}: ${ADDS}` },
  { name: "six lines added", over: { lines_added: SIX }, problem: `${AT}: ${ADDS}` },
  { name: "six lines removed", over: { lines_removed: SIX }, problem: `${AT}: ${ADDS}` },
  { name: "removes with six lines removed", over: { status: "removes", lines_added: [], lines_removed: SIX }, problem: `${AT}: ${REMOVES}` },
  { name: "a line over 300", over: { lines_added: ["x".repeat(301)] }, problem: `${AT}: each line is one line of at most 300 characters` },
  { name: "a line holding a break", over: { lines_added: ["one\ntwo"] }, problem: `${AT}: each line is one line of at most 300 characters` },
  { name: "refines with no removed line", over: { status: "refines" }, problem: `${AT}: refines needs the line it removes` },
  { name: "replaces with no removed line", over: { status: "replaces", lines_removed: [] }, problem: `${AT}: replaces needs the line it removes` },
  { name: "an unknown status", over: { status: "drops" }, problem: `${AT}: status must be new, refines, replaces or removes` },
  {
    name: "removes with a line added", over: { status: "removes", lines_removed: ["Old line."] },
    problem: `${AT}: ${REMOVES}`,
  },
  {
    name: "removes with no removed line", over: { status: "removes", lines_added: [], lines_removed: [" "] },
    problem: `${AT}: ${REMOVES}`,
  },
];

export interface UnseenStatusCase { name: string; over: Record<string, unknown>; problem: string }

/** A motif of each status that copies an owner line, in an answer given without owner lines. */
export const UNSEEN_STATUS_CASES: readonly UnseenStatusCase[] = (["refines", "replaces", "removes"] as const).map((status) => ({
  name: `refuses status ${status} in an answer given without owner lines`,
  over: { status, lines_removed: ["Old line."], ...(status === "removes" ? { lines_added: [] } : {}) },
  problem: `${AT}: ${SEEN_LINES_ONLY(status)}`,
}));

/** Two motifs on the same rows, the second listing them in reverse order. */
export const SAME_ROWS_ANSWER = {
  motifs: [motif(), motif({ title: "Another title", rows: [...(motif() as { rows: string[] }).rows].reverse() })],
};

/** Three motifs: a valid one, one with two problems, one on the first one's rows. */
export const THREE_BAD_MOTIFS = { motifs: [motif(), motif({ title: "", key_term: "" }), motif()] };

/** The kinds, statuses and owner kinds the schema names, each a quoted word of it. */
export const SCHEMA_WORDS: readonly string[] = [
  "test", "analyzer", "architecture-test", "gate", "rule", "new", "refines", "replaces", "removes", "repository", "harness",
];

/** A motif that takes a wrong line out of its owner and adds none. */
export const REMOVES_ANSWER = { motifs: [motif({ status: "removes", lines_added: [], lines_removed: ["Old line."] })] };

export interface LabelCase {
  name: string;
  title: string;
  label: string;
}

/** How a problem names the second motif of an answer, by its title. */
export const LABEL_CASES: readonly LabelCase[] = [
  { name: "names a motif by its number and its title", title: "Refusal paths go untested", label: 'motif 2 "Refusal paths go untested"' },
  { name: "names a motif without a title by its number alone", title: " ", label: "motif 2" },
  { name: "writes a double quote of a title as a single one inside the label", title: 'Prune "old" entries', label: "motif 2 \"Prune 'old' entries\"" },
  {
    name: `cuts a title at ${LABEL_TITLE_CHARS} characters then an ellipsis`, title: "t".repeat(LABEL_TITLE_CHARS + 5),
    label: `motif 2 "${"t".repeat(LABEL_TITLE_CHARS)}…"`,
  },
];

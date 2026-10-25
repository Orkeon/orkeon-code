// The answers checkLearnAnswer is tested on: a valid motif on the wire, the rows shown to the model, and one case per
// refusal of the design's table.
import { checkLearnAnswer } from "./learn-answer.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

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

/** The problems checkLearnAnswer finds in `value`, none when it passes. */
export const problemsOf = (value: unknown): string[] => {
  const r = checkLearnAnswer(value, SHOWN);
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

/** One motif refused, by the field that breaks it. */
export const MOTIF_CASES: readonly MotifCase[] = [
  { name: "empty title", over: { title: "  " }, problem: "motif 1: title must be 1 to 80 characters" },
  { name: "title over 80", over: { title: "x".repeat(81) }, problem: "motif 1: title must be 1 to 80 characters" },
  { name: "topic not a slug", over: { topic: "Refusal Tests" }, problem: "motif 1: topic 'Refusal Tests' is not a kebab slug of at most 60 characters" },
  { name: "topic over 60", over: { topic: "a".repeat(61) }, problem: `motif 1: topic '${"a".repeat(61)}' is not a kebab slug of at most 60 characters` },
  { name: "rows empty", over: { rows: [] }, problem: "motif 1: rows is empty" },
  { name: "row not shown", over: { rows: ["abc"] }, problem: "motif 1: row 'abc' is not one of the rows given" },
  { name: "row twice", over: { rows: ["c936075d95", "c936075d95"] }, problem: "motif 1: row 'c936075d95' is listed twice" },
  { name: "empty preventive line", over: { preventive_line: "" }, problem: "motif 1: preventive_line is empty" },
  { name: "empty novelty", over: { novelty: " " }, problem: "motif 1: novelty is empty" },
  { name: "empty key term", over: { key_term: "" }, problem: "motif 1: key_term is empty" },
  { name: "absolute owner path", over: { owner_path: `${WORKSPACE}/CONTRIBUTING.md` }, problem: `motif 1: owner_path '${WORKSPACE}/CONTRIBUTING.md' is not a relative path` },
  { name: "owner path with ..", over: { owner_path: "docs/../x.md" }, problem: "motif 1: owner_path 'docs/../x.md' is not a relative path" },
  { name: "owner path with a backslash", over: { owner_path: "docs\\x.md" }, problem: "motif 1: owner_path 'docs\\x.md' is not a relative path" },
  { name: "owner path with an edge space", over: { owner_path: " x.md" }, problem: "motif 1: owner_path ' x.md' is not a relative path" },
  {
    name: "repository owner under .claude/", over: { owner_path: ".claude/rules/x.md" },
    problem: "motif 1: .claude/ is the harness's deployed copy: name the orkeon-workshop file with owner_kind harness",
  },
  {
    name: "harness owner outside the packs", over: { owner_kind: "harness", owner_path: "CONTRIBUTING.md" },
    problem: "motif 1: a harness owner is a file of the orkeon-workshop repository under .devcontainer/harness/packs/",
  },
  { name: "no line added", over: { lines_added: [] }, problem: "motif 1: 1 to 5 lines added and at most 5 removed" },
  { name: "six lines added", over: { lines_added: ["a", "b", "c", "d", "e", "f"] }, problem: "motif 1: 1 to 5 lines added and at most 5 removed" },
  { name: "six lines removed", over: { lines_removed: ["a", "b", "c", "d", "e", "f"] }, problem: "motif 1: 1 to 5 lines added and at most 5 removed" },
  { name: "a line over 300", over: { lines_added: ["x".repeat(301)] }, problem: "motif 1: each line is one line of at most 300 characters" },
  { name: "a line holding a break", over: { lines_added: ["one\ntwo"] }, problem: "motif 1: each line is one line of at most 300 characters" },
  { name: "refines with no removed line", over: { status: "refines" }, problem: "motif 1: refines needs the line it removes" },
  { name: "replaces with no removed line", over: { status: "replaces", lines_removed: [] }, problem: "motif 1: replaces needs the line it removes" },
];

/** Two motifs on the same rows, the second listing them in reverse order. */
export const SAME_ROWS_ANSWER = {
  motifs: [motif(), motif({ title: "Another title", rows: [...(motif() as { rows: string[] }).rows].reverse() })],
};

/** Three motifs: a valid one, one with two problems, one on the first one's rows. */
export const THREE_BAD_MOTIFS = { motifs: [motif(), motif({ title: "", key_term: "" }), motif()] };

/** The kinds, statuses and owner kinds the schema names, each a quoted word of it. */
export const SCHEMA_WORDS: readonly string[] = ["test", "analyzer", "architecture-test", "gate", "rule", "new", "refines", "replaces", "repository", "harness"];

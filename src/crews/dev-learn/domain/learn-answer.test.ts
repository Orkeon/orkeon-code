// The learner's answer check: one case per refusal of the design's table, the mapping
// from the wire's snake_case, and the lists an answer may leave out. Run:
//   node --test src/crews/dev-learn/domain/learn-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { LEARN_ANSWER_SCHEMA, checkLearnAnswer } from "./learn-answer.ts";

const SHOWN = new Set(["c936075d95", "b983faad38", "3a59a45e69", "7b3b561c93"]);
const motif = (over: Record<string, unknown> = {}) => ({
  title: " Refusal paths go untested ", topic: "refusal-tests", rows: ["c936075d95", "b983faad38", "3a59a45e69"],
  preventive_line: "Each refusal text of a command has a test that triggers it.",
  owner_kind: "repository", owner_path: "CONTRIBUTING.md", check: "test", status: "new",
  lines_added: ["Every refusal a command prints has a test that makes it print."],
  novelty: "the guide names no refusal test", key_term: "refusal",
  ...over,
});
const problemsOf = (value: unknown): string[] => {
  const r = checkLearnAnswer(value, SHOWN);
  return r.ok ? [] : r.problems;
};
const one = (over: Record<string, unknown>): string[] => problemsOf({ motifs: [motif(over)] });

describe("checkLearnAnswer — a valid answer", () => {
  it("maps snake_case to camelCase, trims, and fills the lists left out", () => {
    const r = checkLearnAnswer({ motifs: [motif()] }, SHOWN);
    ok(r.ok);
    deepStrictEqual(r.value, {
      motifs: [{
        title: "Refusal paths go untested", topic: "refusal-tests", rows: ["c936075d95", "b983faad38", "3a59a45e69"],
        preventiveLine: "Each refusal text of a command has a test that triggers it.",
        owner: { kind: "repository", path: "CONTRIBUTING.md" }, check: "test", status: "new",
        linesRemoved: [], linesAdded: ["Every refusal a command prints has a test that makes it print."],
        novelty: "the guide names no refusal test", keyTerm: "refusal",
      }],
      dropped: [],
    });
  });

  it("keeps the model's dropped items and a harness owner", () => {
    const r = checkLearnAnswer({
      motifs: [motif({
        owner_kind: "harness", owner_path: ".devcontainer/harness/packs/dev/claude/skills/dev-verify/references/audit-axes.md",
        status: "refines", lines_removed: ["Old line."],
      })],
      dropped: [{ title: "Vague", filter: "prevention", reason: "a reminder stops nothing" }],
    }, SHOWN);
    ok(r.ok);
    deepStrictEqual(r.value.dropped, [{ title: "Vague", filter: "prevention", reason: "a reminder stops nothing" }]);
    deepStrictEqual(r.value.motifs[0].linesRemoved, ["Old line."]);
  });

  it("accepts an empty list of motifs", () => {
    deepStrictEqual(problemsOf({ motifs: [] }), []);
  });
});

describe("checkLearnAnswer — each refusal", () => {
  const cases: Array<[string, unknown, string]> = [
    ["not an object", [1], "the answer is not an object"],
    ["motifs not a list", { motifs: "x" }, "motifs must be a list"],
    ["more than 3 motifs", { motifs: [motif(), motif(), motif(), motif()] }, "at most 3 motifs, not 4"],
  ];
  for (const [name, value, problem] of cases) {
    it(name, () => ok(problemsOf(value).includes(problem), JSON.stringify(problemsOf(value))));
  }

  const motifCases: Array<[string, Record<string, unknown>, string]> = [
    ["empty title", { title: "  " }, "motif 1: title must be 1 to 80 characters"],
    ["title over 80", { title: "x".repeat(81) }, "motif 1: title must be 1 to 80 characters"],
    ["topic not a slug", { topic: "Refusal Tests" }, "motif 1: topic 'Refusal Tests' is not a kebab slug of at most 60 characters"],
    ["topic over 60", { topic: "a".repeat(61) }, `motif 1: topic '${"a".repeat(61)}' is not a kebab slug of at most 60 characters`],
    ["rows empty", { rows: [] }, "motif 1: rows is empty"],
    ["row not shown", { rows: ["abc"] }, "motif 1: row 'abc' is not one of the rows given"],
    ["row twice", { rows: ["c936075d95", "c936075d95"] }, "motif 1: row 'c936075d95' is listed twice"],
    ["empty preventive line", { preventive_line: "" }, "motif 1: preventive_line is empty"],
    ["empty novelty", { novelty: " " }, "motif 1: novelty is empty"],
    ["empty key term", { key_term: "" }, "motif 1: key_term is empty"],
    ["absolute owner path", { owner_path: "/workspace/CONTRIBUTING.md" }, "motif 1: owner_path '/workspace/CONTRIBUTING.md' is not a relative path"],
    ["owner path with ..", { owner_path: "docs/../x.md" }, "motif 1: owner_path 'docs/../x.md' is not a relative path"],
    ["owner path with a backslash", { owner_path: "docs\\x.md" }, "motif 1: owner_path 'docs\\x.md' is not a relative path"],
    ["owner path with an edge space", { owner_path: " x.md" }, "motif 1: owner_path ' x.md' is not a relative path"],
    ["repository owner under .claude/", { owner_path: ".claude/rules/x.md" },
      "motif 1: .claude/ is the harness's deployed copy: name the orkeon-workshop file with owner_kind harness"],
    ["harness owner outside the packs", { owner_kind: "harness", owner_path: "CONTRIBUTING.md" },
      "motif 1: a harness owner is a file of the orkeon-workshop repository under .devcontainer/harness/packs/"],
    ["no line added", { lines_added: [] }, "motif 1: 1 to 5 lines added and at most 5 removed"],
    ["six lines added", { lines_added: ["a", "b", "c", "d", "e", "f"] }, "motif 1: 1 to 5 lines added and at most 5 removed"],
    ["six lines removed", { lines_removed: ["a", "b", "c", "d", "e", "f"] }, "motif 1: 1 to 5 lines added and at most 5 removed"],
    ["a line over 300", { lines_added: ["x".repeat(301)] }, "motif 1: each line is one line of at most 300 characters"],
    ["a line holding a break", { lines_added: ["one\ntwo"] }, "motif 1: each line is one line of at most 300 characters"],
    ["refines with no removed line", { status: "refines" }, "motif 1: refines needs the line it removes"],
    ["replaces with no removed line", { status: "replaces", lines_removed: [] }, "motif 1: replaces needs the line it removes"],
  ];
  for (const [name, over, problem] of motifCases) {
    it(name, () => ok(one(over).includes(problem), JSON.stringify(one(over))));
  }

  it("a dropped item missing a field, and dropped not a list", () => {
    deepStrictEqual(problemsOf({ motifs: [], dropped: [{ title: "x", filter: "novelty" }] }),
      ["dropped 1: title, filter and reason are needed"]);
    deepStrictEqual(problemsOf({ motifs: [], dropped: "x" }), ["dropped 1: title, filter and reason are needed"]);
  });

  it("two motifs on the same rows, in any order", () => {
    const rows = (motif() as { rows: string[] }).rows;
    deepStrictEqual(problemsOf({ motifs: [motif(), motif({ title: "Another title", rows: [...rows].reverse() })] }),
      ["motif 2: the same rows as motif 1: merge them into one motif"]);
  });

  it("collects every problem, numbered from 1, motif by motif", () => {
    deepStrictEqual(problemsOf({ motifs: [motif(), motif({ title: "", key_term: "" }), motif()] }), [
      "motif 2: title must be 1 to 80 characters", "motif 2: key_term is empty", "motif 3: the same rows as motif 1: merge them into one motif",
    ]);
  });
});

describe("LEARN_ANSWER_SCHEMA", () => {
  it("names the kinds, the statuses and the required fields", () => {
    const s = JSON.stringify(LEARN_ANSWER_SCHEMA);
    for (const word of ["test", "analyzer", "architecture-test", "gate", "rule", "new", "refines", "replaces", "repository", "harness"]) {
      ok(s.includes(`"${word}"`), word);
    }
    const required = (LEARN_ANSWER_SCHEMA as any).properties.motifs.items.required as string[];
    ok(required.includes("rows") && required.includes("key_term"));
    strictEqual(required.includes("lines_removed"), false);
  });
});

// The golden file, the rag_eval results and the probe facts the probe-verdict tests read.
import type { Golden, ProbeFacts } from "./probe-verdict.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** A golden file in the fixture's subset: a comment, the top keys, a case with relevants and a negative case. */
export const GOLDEN_YAML = [
  "# a comment",
  "name: g",
  `corpus: ${WORKSPACE}/.orkeon/memory/entries`,
  "collection: memory-eval-golden",
  "cases:",
  "  - id: q01",
  "    question: \"Two: one?\"",
  "    relevant: [entries/a.md, entries/b.md]",
  "    tags: [decision]",
  "  - id: q13",
  "    question: Nothing here?",
  "    relevant: []",
  "    tags: [negative]",
  "",
].join("\n");

/** The cases of GOLDEN_YAML as [id, question, relevant, tags]. */
export const GOLDEN_CASE_ROWS = [
  ["q01", "Two: one?", ["entries/a.md", "entries/b.md"], ["decision"]],
  ["q13", "Nothing here?", [], ["negative"]],
];

/** GOLDEN_YAML read. */
export const GOLDEN: Golden = {
  name: "g",
  corpus: `${WORKSPACE}/.orkeon/memory/entries`,
  collection: "memory-eval-golden",
  cases: [
    { id: "q01", question: "Two: one?", relevant: ["entries/a.md", "entries/b.md"], tags: ["decision"] },
    { id: "q13", question: "Nothing here?", relevant: [], tags: ["negative"] },
  ],
};

export interface RefusedGoldenCase {
  name: string;
  text: string;
  error: RegExp;
}

/** Golden files parseGolden refuses. */
export const REFUSED_GOLDENS: readonly RefusedGoldenCase[] = [
  {
    name: "an unknown case key",
    text: GOLDEN_YAML.replace("tags: [negative]", "expected: [x]"),
    error: /unknown case key 'expected'/,
  },
  { name: "a missing top key", text: GOLDEN_YAML.replace("name: g\n", ""), error: /'name' is missing/ },
];

/** rag_eval's rows: q01 found at rank 1 with half its relevants, q13 without scores. */
export const RAG_EVAL_ROWS = { cases: [{ case_id: "q01", recall_at_k: 0.5, reciprocal_rank: 1 }, { case_id: "q13" }] };

/** Probe facts meeting every threshold, `over` replacing some. */
export function facts(over: Partial<ProbeFacts> = {}): ProbeFacts {
  return {
    scores: { recall: 0.9, mrr: 0.8, gated: ["q01"], missing: [] },
    supersession: { recalled: ["shop-decision-new"], superseded: ["shop-decision-old"] },
    negative: { block: "", recalled: [] },
    ...over,
  };
}

export interface FailingFactsCase {
  name: string;
  over: Partial<ProbeFacts>;
}

/** Facts that each break one threshold. */
export const FAILING_FACTS: readonly FailingFactsCase[] = [
  { name: "recall@5 below 0.85", over: { scores: { recall: 0.84, mrr: 0.8, gated: ["q01"], missing: [] } } },
  { name: "MRR below 0.70", over: { scores: { recall: 0.9, mrr: 0.69, gated: ["q01"], missing: [] } } },
  {
    name: "a kept superseded id",
    over: { supersession: { recalled: ["shop-decision-old"], superseded: ["shop-decision-old"] } },
  },
  { name: "a rendered block", over: { negative: { block: "## Precedents\n- x", recalled: ["x"] } } },
  { name: "an error", over: { negative: { error: "index down" } } },
];

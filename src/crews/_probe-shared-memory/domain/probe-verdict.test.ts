// Unit tests for the shared-memory probe's verdict. Run:
//   node --test src/crews/_probe-shared-memory/domain/probe-verdict.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";

import { parseGolden, probeRows, renderProbeTable, retrievalScores } from "./probe-verdict.ts";
import type { Golden, ProbeFacts } from "./probe-verdict.ts";

const YAML = [
  "# a comment",
  "name: g",
  "corpus: /workspace/.orkeon/memory/entries",
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

const golden: Golden = parseGolden(YAML);

describe("parseGolden", () => {
  it("reads the top keys and the cases of the fixture's subset", () => {
    strictEqual(golden.collection, "memory-eval-golden");
    deepStrictEqual(golden.cases.map((c) => [c.id, c.question, c.relevant, c.tags]), [
      ["q01", "Two: one?", ["entries/a.md", "entries/b.md"], ["decision"]],
      ["q13", "Nothing here?", [], ["negative"]],
    ]);
  });

  it("refuses an unknown case key and a missing top key", () => {
    throws(() => parseGolden(YAML.replace("tags: [negative]", "expected: [x]")), /unknown case key 'expected'/);
    throws(() => parseGolden(YAML.replace("name: g\n", "")), /'name' is missing/);
  });
});

describe("retrievalScores", () => {
  it("averages recall@k and the reciprocal rank over the cases with a relevant, from rag_eval's rows", () => {
    const s = retrievalScores(golden, { cases: [{ case_id: "q01", recall_at_k: 0.5, reciprocal_rank: 1 }, { case_id: "q13" }] });
    deepStrictEqual(s, { recall: 0.5, mrr: 1, gated: ["q01"], missing: [] });
  });

  it("reads a JSON text result and counts a missing gated case as 0", () => {
    const s = retrievalScores(golden, JSON.stringify({ cases: [] }));
    deepStrictEqual(s, { recall: 0, mrr: 0, gated: ["q01"], missing: ["q01"] });
  });
});

function facts(over: Partial<ProbeFacts> = {}): ProbeFacts {
  return {
    scores: { recall: 0.9, mrr: 0.8, gated: ["q01"], missing: [] },
    supersession: { recalled: ["shop-decision-new"], superseded: ["shop-decision-old"] },
    negative: { block: "", recalled: [] },
    ...over,
  };
}

describe("probeRows and renderProbeTable", () => {
  it("passes when every threshold is met", () => {
    const rows = probeRows(facts());
    ok(rows.every((r) => r.pass));
    ok(renderProbeTable(rows).endsWith("shared-memory probe: PASS"));
  });

  it("fails on recall@5 below 0.85, MRR below 0.70, a kept superseded id, a rendered block or an error", () => {
    const cases: Array<Partial<ProbeFacts>> = [
      { scores: { recall: 0.84, mrr: 0.8, gated: ["q01"], missing: [] } },
      { scores: { recall: 0.9, mrr: 0.69, gated: ["q01"], missing: [] } },
      { supersession: { recalled: ["shop-decision-old"], superseded: ["shop-decision-old"] } },
      { negative: { block: "## Precedents\n- x", recalled: ["x"] } },
      { negative: { error: "index down" } },
    ];
    for (const over of cases) {
      const table = renderProbeTable(probeRows(facts(over)));
      ok(table.endsWith("shared-memory probe: FAIL"), table);
    }
  });

  it("fails the supersession row when the target supersedes nothing (the check would prove nothing)", () => {
    const rows = probeRows(facts({ supersession: { recalled: [], superseded: [] } }));
    strictEqual(rows[2].pass, false);
  });
});

// Unit tests for the shared-memory probe's verdict. Run:
//   node --test tests/crews/_probe-shared-memory/domain/probe-verdict.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";

import { parseGolden, probeRows, renderProbeTable, retrievalScores } from "../../../../src/crews/_probe-shared-memory/domain/probe-verdict.ts";
import { FAILING_FACTS, GOLDEN, GOLDEN_CASE_ROWS, GOLDEN_YAML, RAG_EVAL_ROWS, REFUSED_GOLDENS, facts } from "./probe-verdict.fixtures.ts";

describe("parseGolden", () => {
  it("reads the top keys and the cases of the fixture's subset", () => {
    // Arrange
    const text = GOLDEN_YAML;

    // Act
    const golden = parseGolden(text);

    // Assert
    strictEqual(golden.collection, "memory-eval-golden");
    deepStrictEqual(golden.cases.map((c) => [c.id, c.question, c.relevant, c.tags]), GOLDEN_CASE_ROWS);
  });

  for (const c of REFUSED_GOLDENS) {
    it(`refuses ${c.name}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const act = () => parseGolden(text);

      // Assert
      throws(act, c.error);
    });
  }
});

describe("retrievalScores", () => {
  it("averages recall@k and the reciprocal rank over the cases with a relevant, from rag_eval's rows", () => {
    // Arrange
    const result = RAG_EVAL_ROWS;

    // Act
    const s = retrievalScores(GOLDEN, result);

    // Assert
    deepStrictEqual(s, { recall: 0.5, mrr: 1, gated: ["q01"], missing: [] });
  });

  it("reads a JSON text result and counts a missing gated case as 0", () => {
    // Arrange
    const result = JSON.stringify({ cases: [] });

    // Act
    const s = retrievalScores(GOLDEN, result);

    // Assert
    deepStrictEqual(s, { recall: 0, mrr: 0, gated: ["q01"], missing: ["q01"] });
  });
});

describe("probeRows and renderProbeTable", () => {
  it("passes every row when every threshold is met", () => {
    // Arrange
    const met = facts();

    // Act
    const rows = probeRows(met);

    // Assert
    ok(rows.every((r) => r.pass));
  });

  it("renders a PASS verdict when every threshold is met", () => {
    // Arrange
    const rows = probeRows(facts());

    // Act
    const table = renderProbeTable(rows);

    // Assert
    ok(table.endsWith("shared-memory probe: PASS"));
  });

  for (const c of FAILING_FACTS) {
    it(`fails on ${c.name}`, () => {
      // Arrange
      const rows = probeRows(facts(c.over));

      // Act
      const table = renderProbeTable(rows);

      // Assert
      ok(table.endsWith("shared-memory probe: FAIL"), table);
    });
  }

  it("fails the supersession row when the target supersedes nothing (the check would prove nothing)", () => {
    // Arrange
    const over = facts({ supersession: { recalled: [], superseded: [] } });

    // Act
    const rows = probeRows(over);

    // Assert
    strictEqual(rows[2].pass, false);
  });
});

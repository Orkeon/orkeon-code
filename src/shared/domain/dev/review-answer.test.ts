// The reviewer's JSON answer: its schema and every problem the check names. Run:
//   node --test src/shared/domain/dev/review-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";

import { MAX_REVIEW_ROWS, REVIEW_ANSWER_SCHEMA, checkReviewAnswer } from "./review-answer.ts";

const CTX = { targets: ["plan", "F1", "F2", "F3"] };
const row = (over: Record<string, unknown> = {}) => ({
  severity: "Major", question: "Does the refund keep the original currency?", evidence: "src/pay/Refund.ts:14",
  target: "F1", ...over,
});
const answer = (over: Record<string, unknown> = {}) => ({ verdict: "GAPS", rows: [row()], ...over });
const problemsOf = (value: unknown): string[] => {
  const checked = checkReviewAnswer(value, CTX);
  return checked.ok ? [] : checked.problems;
};

describe("REVIEW_ANSWER_SCHEMA", () => {
  it("requires the verdict and the rows, and every field of a row", () => {
    const schema = REVIEW_ANSWER_SCHEMA as {
      required: string[];
      properties: { verdict: { enum: string[] }; rows: { items: { required: string[]; properties: { severity: { enum: string[] } } } } };
    };
    deepStrictEqual(schema.required, ["verdict", "rows"]);
    deepStrictEqual(schema.properties.verdict.enum, ["CLEAR", "GAPS"]);
    deepStrictEqual(schema.properties.rows.items.required, ["severity", "question", "evidence", "target"]);
    deepStrictEqual(schema.properties.rows.items.properties.severity.enum, ["Blocking", "Major"]);
  });
});

describe("checkReviewAnswer", () => {
  it("accepts a well-formed answer, trimmed", () => {
    deepStrictEqual(checkReviewAnswer(answer({
      rows: [row({ question: "  Does the refund keep the original currency? ", evidence: " src/pay/Refund.ts:14\n", target: " F1 " })],
    }), CTX), {
      ok: true,
      value: { verdict: "GAPS", rows: [{ severity: "Major", question: "Does the refund keep the original currency?", evidence: "src/pay/Refund.ts:14", target: "F1" }] },
    });
  });

  it("accepts CLEAR with no row", () => {
    deepStrictEqual(checkReviewAnswer({ verdict: "CLEAR", rows: [] }, CTX), { ok: true, value: { verdict: "CLEAR", rows: [] } });
  });

  it("refuses what is not an object", () => {
    deepStrictEqual(problemsOf("CLEAR"), ["the answer is not an object"]);
    deepStrictEqual(problemsOf(null), ["the answer is not an object"]);
  });

  it("refuses rows that are not a list", () => {
    deepStrictEqual(problemsOf({ verdict: "CLEAR", rows: "none" }), ["rows must be a list"]);
  });

  it("verdict must be CLEAR or GAPS", () => {
    deepStrictEqual(problemsOf(answer({ verdict: "VALID" })), ["verdict must be CLEAR or GAPS"]);
  });

  it("CLEAR holds no row, GAPS holds one at least", () => {
    deepStrictEqual(problemsOf(answer({ verdict: "CLEAR" })), ["CLEAR with rows"]);
    deepStrictEqual(problemsOf({ verdict: "GAPS", rows: [] }), ["GAPS without a row"]);
  });

  it("at most 12 rows", () => {
    const rows = Array.from({ length: MAX_REVIEW_ROWS + 1 }, (_, i) => row({ question: `Is case ${i} covered?` }));
    deepStrictEqual(problemsOf(answer({ rows })), ["at most 12 rows, not 13"]);
    ok(checkReviewAnswer(answer({ rows: rows.slice(0, MAX_REVIEW_ROWS) }), CTX).ok);
  });

  it("severity is Blocking or Major, never Minor", () => {
    deepStrictEqual(problemsOf(answer({ rows: [row({ severity: "Minor" })] })), ["row 1: severity must be Blocking or Major"]);
    ok(checkReviewAnswer(answer({ rows: [row({ severity: "Blocking" })] }), CTX).ok);
  });

  it("the question is one closed question ending with ?", () => {
    const refused = "row 1: the question must be one closed question ending with ?";
    for (const question of ["", "The refund keeps the currency.", "Is it A | B?", "Is it A?\nOr B?", `${"Is it long ".repeat(30)}?`]) {
      deepStrictEqual(problemsOf(answer({ rows: [row({ question })] })), [refused], JSON.stringify(question));
    }
    ok(checkReviewAnswer(answer({ rows: [row({ question: `${"a".repeat(299)}?` })] }), CTX).ok);
  });

  it("evidence fits a table cell", () => {
    const refused = "row 1: evidence cannot sit in a table cell";
    for (const evidence of ["", "   ", "src/a.ts:3 | src/b.ts:4", "src/a.ts:3\nsrc/b.ts:4"]) {
      deepStrictEqual(problemsOf(answer({ rows: [row({ evidence })] })), [refused], JSON.stringify(evidence));
    }
  });

  it("evidence cites a path:line, a § n or a heading of the plan", () => {
    for (const evidence of ["src/a/B.ts:12", "PRUNE-PLAN.md § 3", "§2 of the spec", "## Anchors of F2"]) {
      ok(checkReviewAnswer(answer({ rows: [row({ evidence })] }), CTX).ok, evidence);
    }
    deepStrictEqual(problemsOf(answer({ rows: [row({ evidence: "the plan, somewhere" })] })),
      ["row 1: evidence cites no path:line, § n or section"]);
  });

  it("target is one the caller names", () => {
    deepStrictEqual(problemsOf(answer({ rows: [row({ target: "F4" })] })), ["row 1: target 'F4' is not one of plan, F1…F3"]);
    ok(checkReviewAnswer(answer({ rows: [row({ target: "plan" })] }), CTX).ok);
  });

  it("a question asked twice, folding case and spaces, repeats the first row", () => {
    const rows = [
      row(), row({ question: "Is the date in UTC?" }),
      row({ question: "does the  refund keep the ORIGINAL currency?" }),
    ];
    deepStrictEqual(problemsOf(answer({ rows })), ["row 3: repeats row 1"]);
  });

  it("names every problem of every row", () => {
    deepStrictEqual(problemsOf(answer({ rows: [row(), row({ severity: "Minor", question: "No.", target: "x" })] })), [
      "row 2: severity must be Blocking or Major",
      "row 2: the question must be one closed question ending with ?",
      "row 2: target 'x' is not one of plan, F1…F3",
    ]);
  });
});

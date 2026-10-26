// The reviewer's JSON answer: its schema and every problem the check names. Run:
//   node --test tests/shared/domain/dev/review-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { MAX_REVIEW_ROWS, REVIEW_ANSWER_SCHEMA, checkReviewAnswer } from "../../../../src/shared/domain/dev/review-answer.ts";
import {
  answer, BACKSLASHED_ROW, BAD_QUESTIONS, CITING_EVIDENCE, CTX, distinctRows, PIPED_ROW, problemsOf, REFUSED_QUESTION,
  REPEATED_ROWS, row,
} from "./review-answer.fixtures.ts";
import type { SchemaShape } from "./review-answer.fixtures.ts";

describe("REVIEW_ANSWER_SCHEMA", () => {
  it("requires the verdict and the rows, and every field of a row", () => {
    // Arrange
    const shape = REVIEW_ANSWER_SCHEMA;

    // Act
    const schema = shape as SchemaShape;

    // Assert
    deepStrictEqual(schema.required, ["verdict", "rows"]);
    deepStrictEqual(schema.properties.verdict.enum, ["CLEAR", "GAPS"]);
    deepStrictEqual(schema.properties.rows.items.required, ["severity", "question", "evidence", "target"]);
    deepStrictEqual(schema.properties.rows.items.properties.severity.enum, ["Blocking", "Major"]);
  });
});

describe("checkReviewAnswer", () => {
  it("accepts a well-formed answer, trimmed", () => {
    // Arrange
    const value = answer({
      rows: [row({ question: "  Does the refund keep the original currency? ", evidence: " src/pay/Refund.ts:14\n", target: " F1 " })],
    });

    // Act
    const checked = checkReviewAnswer(value, CTX);

    // Assert
    deepStrictEqual(checked, {
      ok: true,
      value: { verdict: "GAPS", rows: [{ severity: "Major", question: "Does the refund keep the original currency?", evidence: "src/pay/Refund.ts:14", target: "F1" }] },
    });
  });

  it("accepts CLEAR with no row", () => {
    // Arrange
    const value = { verdict: "CLEAR", rows: [] };

    // Act
    const checked = checkReviewAnswer(value, CTX);

    // Assert
    deepStrictEqual(checked, { ok: true, value: { verdict: "CLEAR", rows: [] } });
  });

  for (const value of ["CLEAR", null]) {
    it(`refuses what is not an object: ${JSON.stringify(value)}`, () => {
      // Arrange
      const candidate = value;

      // Act
      const problems = problemsOf(candidate);

      // Assert
      deepStrictEqual(problems, ["the answer is not an object"]);
    });
  }

  it("refuses rows that are not a list", () => {
    // Arrange
    const value = { verdict: "CLEAR", rows: "none" };

    // Act
    const problems = problemsOf(value);

    // Assert
    deepStrictEqual(problems, ["rows must be a list"]);
  });

  it("verdict must be CLEAR or GAPS", () => {
    // Arrange
    const value = answer({ verdict: "VALID" });

    // Act
    const problems = problemsOf(value);

    // Assert
    deepStrictEqual(problems, ["verdict must be CLEAR or GAPS"]);
  });

  it("takes the verdict from the rows: GAPS with one, whatever word was copied", () => {
    // Arrange
    const value = answer({ verdict: "CLEAR" });

    // Act
    const withRows = checkReviewAnswer(value, CTX);

    // Assert
    ok(withRows.ok && withRows.value.verdict === "GAPS" && withRows.value.rows.length > 0);
  });

  it("takes the verdict from the rows: CLEAR with none, whatever word was copied", () => {
    // Arrange
    const value = { verdict: "GAPS", rows: [] };

    // Act
    const none = checkReviewAnswer(value, CTX);

    // Assert
    deepStrictEqual(none, { ok: true, value: { verdict: "CLEAR", rows: [] } });
  });

  it("at most 12 rows: refuses 13", () => {
    // Arrange
    const rows = distinctRows(MAX_REVIEW_ROWS + 1);

    // Act
    const problems = problemsOf(answer({ rows }));

    // Assert
    deepStrictEqual(problems, ["at most 12 rows, not 13"]);
  });

  it("at most 12 rows: accepts 12", () => {
    // Arrange
    const rows = distinctRows(MAX_REVIEW_ROWS);

    // Act
    const checked = checkReviewAnswer(answer({ rows }), CTX);

    // Assert
    ok(checked.ok);
  });

  it("severity is Blocking or Major, never Minor", () => {
    // Arrange
    const value = answer({ rows: [row({ severity: "Minor" })] });

    // Act
    const problems = problemsOf(value);

    // Assert
    deepStrictEqual(problems, ["row 1: severity must be Blocking or Major"]);
  });

  it("severity Blocking is accepted", () => {
    // Arrange
    const value = answer({ rows: [row({ severity: "Blocking" })] });

    // Act
    const checked = checkReviewAnswer(value, CTX);

    // Assert
    ok(checked.ok);
  });

  for (const c of BAD_QUESTIONS) {
    it(`the question is one closed question ending with ?: ${c.fault}`, () => {
      // Arrange
      const value = answer({ rows: [row({ question: c.question })] });

      // Act
      const problems = problemsOf(value);

      // Assert
      deepStrictEqual(problems, [`${REFUSED_QUESTION} (${c.fault})`], JSON.stringify(c.question));
    });
  }

  it("the question may take 300 characters", () => {
    // Arrange
    const value = answer({ rows: [row({ question: `${"a".repeat(299)}?` })] });

    // Act
    const checked = checkReviewAnswer(value, CTX);

    // Assert
    ok(checked.ok);
  });

  for (const evidence of ["", "   "]) {
    it(`refuses empty evidence: ${JSON.stringify(evidence)}`, () => {
      // Arrange
      const value = answer({ rows: [row({ evidence })] });

      // Act
      const problems = problemsOf(value);

      // Assert
      deepStrictEqual(problems, ["row 1: evidence is empty"], JSON.stringify(evidence));
    });
  }

  it("fits a question and its evidence in a table cell: a `|` escaped, a line break a space, never a refusal", () => {
    // Arrange
    const value = answer({ rows: [PIPED_ROW] });

    // Act
    const out = checkReviewAnswer(value, CTX);

    // Assert
    ok(out.ok);
    strictEqual(out.ok && out.value.rows[0].evidence, "src/a.ts:3 \\| src/b.ts:4 and `## Design` row `Rounding \\| none`");
    strictEqual(out.ok && out.value.rows[0].question, "Is it A \\| B? Or C?");
  });

  it("escapes a backslash before the `|`, so that it cannot undo the pipe's escape", () => {
    // Arrange
    const value = answer({ rows: [BACKSLASHED_ROW] });

    // Act
    const out = checkReviewAnswer(value, CTX);

    // Assert
    strictEqual(out.ok && out.value.rows[0].evidence, "src\\\\a.ts:3 \\\\\\| a Windows path `C:\\\\x`");
  });

  for (const evidence of CITING_EVIDENCE) {
    it(`evidence cites a path:line, a section (§ n, § heading) or a heading of the plan: ${evidence}`, () => {
      // Arrange
      const value = answer({ rows: [row({ evidence })] });

      // Act
      const checked = checkReviewAnswer(value, CTX);

      // Assert
      ok(checked.ok, evidence);
    });
  }

  it("refuses evidence that cites nothing", () => {
    // Arrange
    const value = answer({ rows: [row({ evidence: "the plan, somewhere" })] });

    // Act
    const problems = problemsOf(value);

    // Assert
    deepStrictEqual(problems, ["row 1: evidence cites no path:line, § section or heading"]);
  });

  it("target is one the caller names: refuses another", () => {
    // Arrange
    const value = answer({ rows: [row({ target: "F4" })] });

    // Act
    const problems = problemsOf(value);

    // Assert
    deepStrictEqual(problems, ["row 1: target 'F4' is not one of plan, F1…F3"]);
  });

  it("target is one the caller names: accepts plan", () => {
    // Arrange
    const value = answer({ rows: [row({ target: "plan" })] });

    // Act
    const checked = checkReviewAnswer(value, CTX);

    // Assert
    ok(checked.ok);
  });

  it("a question asked twice, folding case and spaces, repeats the first row", () => {
    // Arrange
    const rows = REPEATED_ROWS;

    // Act
    const problems = problemsOf(answer({ rows }));

    // Assert
    deepStrictEqual(problems, ["row 3: repeats row 1"]);
  });

  it("names every problem of every row", () => {
    // Arrange
    const value = answer({ rows: [row(), row({ severity: "Minor", question: "No.", target: "x" })] });

    // Act
    const problems = problemsOf(value);

    // Assert
    deepStrictEqual(problems, [
      "row 2: severity must be Blocking or Major",
      "row 2: the question must be one closed question ending with ? (it does not end with ?)",
      "row 2: target 'x' is not one of plan, F1…F3",
    ]);
  });
});

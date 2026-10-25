// The open questions and decisions of a spec or brief: rows written and read back, the options cell, the numbering
// after every used id, a decided question never asked again, the sections rewritten in place, the review rows.
// Run:  node --test src/shared/domain/dev/questions.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  askingOrder, decide, draftQuestionProblems, numberQuestions, optionsCell, parseDecisions, parseOpenQuestions,
  parseOptionsCell, reviewDrafts, withQuestionSections,
} from "./questions.ts";
import { blockingRows } from "./spec-format.ts";
import {
  CONTEXT_ONLY, DRAFTS, H, HAND_WRITTEN_ROWS, Q1, Q2, REVIEW_ROWS, rewrittenSections, writtenSections,
} from "./questions.fixtures.ts";
import { assertRewrittenInPlace } from "./questions.assertions.ts";

describe("questions — rows", () => {
  it("writes the options with the recommended first", () => {
    // Arrange
    const options = ["Refuse", "90 days"];

    // Act
    const cell = optionsCell(options);

    // Assert
    strictEqual(cell, "1. Refuse (recommended); 2. 90 days");
  });

  it("reads the options back", () => {
    // Arrange
    const cell = "1. Refuse (recommended); 2. 90 days";

    // Act
    const options = parseOptionsCell(cell);

    // Assert
    deepStrictEqual(options, ["Refuse", "90 days"]);
  });

  it("reads no options from a hand-written cell", () => {
    // Arrange
    const cell = "refuse / 90 days";

    // Act
    const options = parseOptionsCell(cell);

    // Assert
    deepStrictEqual(options, [], "a hand-written cell gives no options");
  });

  it("round-trips the open questions, which /dev-plan's gate reads", () => {
    // Arrange
    const text = writtenSections();

    // Act
    const questions = parseOpenQuestions(text);

    // Assert
    deepStrictEqual(questions, [Q1, Q2]);
  });

  it("round-trips the decisions", () => {
    // Arrange
    const text = writtenSections();

    // Act
    const decisions = parseDecisions(text);

    // Assert
    deepStrictEqual(decisions, [{ id: "Q1", question: Q1.question, answer: "Refuse", date: "2026-10-24" }]);
  });

  it("leaves /dev-plan's gate the one Blocking question to read", () => {
    // Arrange
    const text = writtenSections();

    // Act
    const rows = blockingRows(text);

    // Assert
    strictEqual(rows.length, 1);
  });

  it("rewrites the sections where they stood and drops an empty one", () => {
    // Arrange
    const before = withQuestionSections(CONTEXT_ONLY, [Q1], [], H) + "\n## 14. After\n\nA.\n";

    // Act
    const after = withQuestionSections(before, [], [decide(Q1, "a | b\nc", "2026-10-24")], H);

    // Assert
    assertRewrittenInPlace(after);
  });

  it("fits an answer in its cell", () => {
    // Arrange
    const after = rewrittenSections();

    // Act
    const decisions = parseDecisions(after);

    // Assert
    strictEqual(decisions[0].answer, "a / b c", "an answer fits its cell");
  });

  it("numbers a hand-written row without an id after the others", () => {
    // Arrange
    const text = HAND_WRITTEN_ROWS;

    // Act
    const questions = parseOpenQuestions(text, ["Q5"]);

    // Assert
    deepStrictEqual(questions.map((q) => [q.id, q.severity]), [["Q3", "Major"], ["Q6", "Blocking"]]);
  });
});

describe("questions — drafts", () => {
  it("numbers after decided and kept ids, dropping what a decision settled or a kept row asks", () => {
    // Arrange
    const decided = [decide(Q1, "Refuse", "d")];

    // Act
    const out = numberQuestions(DRAFTS, decided, [Q2]);

    // Assert
    deepStrictEqual(out.map((q) => q.id), ["Q2", "Q3"]);
    strictEqual(out[1].question, "Show what is removed?");
  });

  it("asks Blocking first", () => {
    // Arrange
    const questions = [Q1, Q2];

    // Act
    const order = askingOrder(questions);

    // Assert
    deepStrictEqual(order.map((q) => q.id), ["Q2", "Q1"]);
  });

  it("finds no problem in a sound draft", () => {
    // Arrange
    const draft = { severity: "Major", question: "Fine?", impact: "", options: ["A", "B"] };

    // Act
    const problems = draftQuestionProblems(draft, 1);

    // Assert
    deepStrictEqual(problems, []);
  });

  it("finds the bad severity, the missing question mark and the option with a semicolon in a draft", () => {
    // Arrange
    const draft = { severity: "Minor", question: "No mark", impact: "", options: ["A;B", "C"] };

    // Act
    const problems = draftQuestionProblems(draft, 1);

    // Assert
    ok(problems.length >= 3);
  });

  it("finds one problem in a draft offering to leave the question open", () => {
    // Arrange
    const draft = { severity: "Major", question: "Q?", impact: "", options: ["Leave it open", "B"] };

    // Act
    const problems = draftQuestionProblems(draft, 1);

    // Assert
    ok(problems.length === 1);
  });

  it("turns review rows into questions without options, the target in front", () => {
    // Arrange
    const rows = REVIEW_ROWS;

    // Act
    const drafts = reviewDrafts(rows, "spec");

    // Assert
    deepStrictEqual(drafts.map((d) => [d.question, d.impact, d.options.length]), [["UC-01: Is it told?", "review, § 4", 0], ["Whole?", "review, § 2", 0]]);
  });
});

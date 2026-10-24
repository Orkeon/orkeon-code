// The open questions and decisions of a spec or brief: rows written and read back, the options cell, the numbering
// after every used id, a decided question never asked again, the sections rewritten in place, the review rows.
// Run:  node --test src/shared/domain/dev/questions.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  askingOrder, decide, draftQuestionProblems, numberQuestions, optionsCell, parseDecisions, parseOpenQuestions,
  parseOptionsCell, reviewDrafts, withQuestionSections,
} from "./questions.ts";
import type { Question } from "./questions.ts";
import { blockingRows } from "./spec-format.ts";

const Q1: Question = { id: "Q1", severity: "Major", question: "Refuse without a cut-off?", impact: "the command", options: ["Refuse", "90 days"] };
const Q2: Question = { id: "Q2", severity: "Blocking", question: "Prune a pinned entry?", impact: "", options: [] };
const H = { questions: "## 12. Open questions", decisions: "## 13. Decisions" };

describe("questions — rows", () => {
  it("writes the options with the recommended first and reads them back", () => {
    strictEqual(optionsCell(["Refuse", "90 days"]), "1. Refuse (recommended); 2. 90 days");
    deepStrictEqual(parseOptionsCell("1. Refuse (recommended); 2. 90 days"), ["Refuse", "90 days"]);
    deepStrictEqual(parseOptionsCell("refuse / 90 days"), [], "a hand-written cell gives no options");
  });

  it("round-trips the two sections, which /dev-plan's gate reads", () => {
    const text = withQuestionSections("# x — Y\n\n## 1. Context\n\nC.\n", [Q1, Q2], [decide(Q1, "Refuse", "2026-10-24")], H);
    deepStrictEqual(parseOpenQuestions(text), [Q1, Q2]);
    deepStrictEqual(parseDecisions(text), [{ id: "Q1", question: Q1.question, answer: "Refuse", date: "2026-10-24" }]);
    strictEqual(blockingRows(text).length, 1);
  });

  it("rewrites the sections where they stood and drops an empty one", () => {
    const before = withQuestionSections("# x — Y\n\n## 1. Context\n\nC.\n", [Q1], [], H) + "\n## 14. After\n\nA.\n";
    const after = withQuestionSections(before, [], [decide(Q1, "a | b\nc", "2026-10-24")], H);
    ok(!after.includes("## 12. Open questions"));
    ok(after.indexOf("## 13. Decisions") < after.indexOf("## 14. After"));
    strictEqual(parseDecisions(after)[0].answer, "a / b c", "an answer fits its cell");
  });

  it("numbers a hand-written row without an id after the others", () => {
    const text = "## 12. Open questions\n\n| # | Severity | Question | Impact | Options |\n|---|---|---|---|---|\n| Q3 | Major | A? | — | — |\n| 1 | blocking | B? | x | y |\n";
    deepStrictEqual(parseOpenQuestions(text, ["Q5"]).map((q) => [q.id, q.severity]), [["Q3", "Major"], ["Q6", "Blocking"]]);
  });
});

describe("questions — drafts", () => {
  it("numbers after decided and kept ids, dropping what a decision settled or a kept row asks", () => {
    const out = numberQuestions([
      { severity: "Major", question: "refuse without a cut-off", impact: "", options: [] },
      { severity: "Major", question: "Prune a pinned entry?", impact: "", options: [] },
      { severity: "Blocking", question: "Show what is removed?", impact: "", options: ["Yes", "No"] },
    ], [decide(Q1, "Refuse", "d")], [Q2]);
    deepStrictEqual(out.map((q) => q.id), ["Q2", "Q3"]);
    strictEqual(out[1].question, "Show what is removed?");
  });

  it("asks Blocking first and checks a draft", () => {
    deepStrictEqual(askingOrder([Q1, Q2]).map((q) => q.id), ["Q2", "Q1"]);
    deepStrictEqual(draftQuestionProblems({ severity: "Major", question: "Fine?", impact: "", options: ["A", "B"] }, 1), []);
    ok(draftQuestionProblems({ severity: "Minor", question: "No mark", impact: "", options: ["A;B", "C"] }, 1).length >= 3);
    ok(draftQuestionProblems({ severity: "Major", question: "Q?", impact: "", options: ["Leave it open", "B"] }, 1).length === 1);
  });

  it("turns review rows into questions without options, the target in front", () => {
    deepStrictEqual(reviewDrafts([
      { severity: "Blocking", question: "Is it told?", evidence: "§ 4", target: "UC-01" },
      { severity: "Major", question: "Whole?", evidence: "§ 2", target: "spec" },
    ], "spec").map((d) => [d.question, d.impact, d.options.length]), [["UC-01: Is it told?", "review, § 4", 0], ["Whole?", "review, § 2", 0]]);
  });
});

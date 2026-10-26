// Questions, decisions and texts the question helpers are tested on.
import { decide, withQuestionSections } from "../../../../src/shared/domain/dev/questions.ts";
import type { DraftQuestion, Question } from "../../../../src/shared/domain/dev/questions.ts";

export const Q1: Question = { id: "Q1", severity: "Major", question: "Refuse without a cut-off?", impact: "the command", options: ["Refuse", "90 days"] };
export const Q2: Question = { id: "Q2", severity: "Blocking", question: "Prune a pinned entry?", impact: "", options: [] };

/** The headings of the two sections. */
export const H = { questions: "## 12. Open questions", decisions: "## 13. Decisions" };

/** A spec with a context section only. */
export const CONTEXT_ONLY = "# x — Y\n\n## 1. Context\n\nC.\n";

/** The spec with Q1 and Q2 open and Q1 decided. */
export function writtenSections(): string {
  return withQuestionSections(CONTEXT_ONLY, [Q1, Q2], [decide(Q1, "Refuse", "2026-10-24")], H);
}

/** The spec with Q1 open and a section after, rewritten with no open question and Q1 decided with an answer that
 *  breaks a cell. */
export function rewrittenSections(): string {
  const before = withQuestionSections(CONTEXT_ONLY, [Q1], [], H) + "\n## 14. After\n\nA.\n";
  return withQuestionSections(before, [], [decide(Q1, "a | b\nc", "2026-10-24")], H);
}

/** A section with a row numbered Q3 and a hand-written one numbered 1, its severity in lower case. */
export const HAND_WRITTEN_ROWS = "## 12. Open questions\n\n| # | Severity | Question | Impact | Options |\n|---|---|---|---|---|\n| Q3 | Major | A? | — | — |\n| 1 | blocking | B? | x | y |\n";

/** Three drafts: one Q1's decision settled, one Q2 kept asks, one new. */
export const DRAFTS: readonly DraftQuestion[] = [
  { severity: "Major", question: "refuse without a cut-off", impact: "", options: [] },
  { severity: "Major", question: "Prune a pinned entry?", impact: "", options: [] },
  { severity: "Blocking", question: "Show what is removed?", impact: "", options: ["Yes", "No"] },
];

/** Two review rows, one on a use case, one on the whole spec. */
export const REVIEW_ROWS = [
  { severity: "Blocking", question: "Is it told?", evidence: "§ 4", target: "UC-01" },
  { severity: "Major", question: "Whole?", evidence: "§ 2", target: "spec" },
];

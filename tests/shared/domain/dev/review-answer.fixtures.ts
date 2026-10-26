// Rows and answers the reviewer's answer check is tested on.
import { checkReviewAnswer } from "../../../../src/shared/domain/dev/review-answer.ts";

/** The targets the caller names. */
export const CTX = { targets: ["plan", "F1", "F2", "F3"] };

/** A well-formed Major row on F1, its fields overridden by `over`. */
export const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  severity: "Major", question: "Does the refund keep the original currency?", evidence: "src/pay/Refund.ts:14",
  target: "F1", ...over,
});

/** A GAPS answer holding one well-formed row, its fields overridden by `over`. */
export const answer = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ verdict: "GAPS", rows: [row()], ...over });

/** The problems the check names for `value`, none when it accepts it. */
export const problemsOf = (value: unknown): string[] => {
  const checked = checkReviewAnswer(value, CTX);
  return checked.ok ? [] : checked.problems;
};

/** The schema's shape as the tests read it. */
export interface SchemaShape {
  required: string[];
  properties: { verdict: { enum: string[] }; rows: { items: { required: string[]; properties: { severity: { enum: string[] } } } } };
}

/** `count` rows, each asking a question of its own. */
export const distinctRows = (count: number): Record<string, unknown>[] =>
  Array.from({ length: count }, (_, i) => row({ question: `Is case ${i} covered?` }));

/** The refusal of a question that is not one closed question. */
export const REFUSED_QUESTION = "row 1: the question must be one closed question ending with ?";

export interface QuestionCase {
  question: string;
  fault: string;
}

export const BAD_QUESTIONS: readonly QuestionCase[] = [
  { question: "", fault: "it is empty" },
  { question: "The refund keeps the currency.", fault: "it does not end with ?" },
  { question: `${"Is it long ".repeat(30)}?`, fault: "it is longer than 300 characters" },
];

/** Evidence citing a path:line, a section (§ n, § heading) or a heading of the plan. */
export const CITING_EVIDENCE: readonly string[] = [
  "src/a/B.ts:12", "PRUNE-PLAN.md § 3", "§2 of the spec", "## Anchors of F2", "CALC-PLAN-F2.md § TDD sequence → Step 1",
];

/** A row whose evidence and question hold a `|` and a line break. */
export const PIPED_ROW = row({ evidence: "src/a.ts:3 | src/b.ts:4\nand `## Design` row `Rounding | none`", question: "Is it A | B?\nOr C?" });

/** A row whose evidence holds a backslash before a `|`: left alone, the backslash would undo the pipe's escape. */
export const BACKSLASHED_ROW = row({ evidence: "src\\a.ts:3 \\| a Windows path `C:\\x`" });

/** Three rows, the third asking the first's question in other case and spacing. */
export const REPEATED_ROWS = [
  row(), row({ question: "Is the date in UTC?" }),
  row({ question: "does the  refund keep the ORIGINAL currency?" }),
];

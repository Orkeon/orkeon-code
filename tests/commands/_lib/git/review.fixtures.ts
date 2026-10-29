// The lines /review and its aliases are typed with, what each reads as, and the texts /passes answers.
import type { parseReviewArgs } from "../../../../src/commands/_lib/git/review.ts";
import { invalidPassesText } from "../../../../src/commands/_lib/git/review.ts";

type Case = { name: string; typed: string; tokens: string[]; expected: ReturnType<typeof parseReviewArgs> };

const review = (input: { files?: string[]; commit?: string; lenses?: string; passes?: number }) =>
  ({ route: "review" as const, input: { files: [], commit: "", lenses: "", ...input } });

export const ROUTE_CASES: readonly Case[] = [
  { name: "reads a bare /review as the staged changes over the configured lenses", typed: "review", tokens: [], expected: review({}) },
  { name: "reads bare paths as the files to review", typed: "review", tokens: ["src/a.ts", "src/b.ts"], expected: review({ files: ["src/a.ts", "src/b.ts"] }) },
  {
    name: "reads --files up to the next option, then --commit",
    typed: "review", tokens: ["--files", "a.ts", "b.ts", "--commit", "abc123"],
    expected: review({ files: ["a.ts", "b.ts"], commit: "abc123" }),
  },
  { name: "reads --lens with its value", typed: "review", tokens: ["--lens", "correctness"], expected: review({ lenses: "correctness" }) },
  { name: "reads --lens=<value>", typed: "review", tokens: ["--lens=style"], expected: review({ lenses: "style" }) },
  { name: "reads --passes as this run's round count", typed: "review", tokens: ["--passes", "3"], expected: review({ passes: 3 }) },
  {
    name: "forces the security lens under /security-review whatever --lens says",
    typed: "security-review", tokens: ["--lens", "style", "src/a.ts"], expected: review({ files: ["src/a.ts"], lenses: "security" }),
  },
  { name: "reads /passes alone as a show of the session count", typed: "passes", tokens: [], expected: { route: "passes", token: "" } },
  { name: "reads /passes <n> as a set of the session count, no review", typed: "passes", tokens: ["3"], expected: { route: "passes", token: "3" } },
  { name: "refuses a --passes out of 1-5", typed: "review", tokens: ["--passes", "9"], expected: { route: "refused", text: invalidPassesText("9") } },
  {
    name: "refuses an unknown lens",
    typed: "review", tokens: ["--lens", "speed"], expected: { route: "refused", text: "review: --lens takes correctness, security, style, not 'speed'" },
  },
  {
    name: "refuses an unknown option",
    typed: "review", tokens: ["--fast"], expected: { route: "refused", text: "review: unknown option '--fast' (--files, --commit, --lens, --passes)" },
  },
  { name: "refuses an option left without its value", typed: "review", tokens: ["--commit"], expected: { route: "refused", text: "review: --commit takes a value" } },
  { name: "unquotes a quoted --commit value", typed: "review", tokens: ["--commit", '"abc123"'], expected: review({ commit: "abc123" }) },
  {
    name: "keeps a quoted path with a space as one file",
    typed: "review", tokens: ['"docs/my', 'notes.md"', "src/a.ts"], expected: review({ files: ["docs/my notes.md", "src/a.ts"] }),
  },
];

export const SHOW_DEFAULT = "reasoning passes: 1 (default)\n/review runs that many lens rounds.\n" +
  "usage: /passes <1-5> (this session) or /review --passes <1-5> (one run)";

export const SET_THREE = "reasoning passes set to 3 — /review will make 9 lens calls per run (session-scoped; /clear clears it).";

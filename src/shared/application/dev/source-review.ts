// The read-only review of a written spec or change brief, once per run: the reviewer's sub-agent questions the
// file, and its rows join the open questions (a row asking what an open question or a decision already holds is
// not added), the file written again. The rows' ids are returned so the caller asks the Blocking ones.
import type { Llm } from "../ports.ts";
import { runSubAgent } from "../agents/run-sub-agent.ts";
import type { ActRoute } from "../agents/route-agent.ts";
import { REVIEWER_CHARTER } from "../../domain/dev/reviewer-charter.ts";
import { REVIEW_ANSWER_SCHEMA, reviewChecks } from "../../domain/dev/review-answer.ts";
import type { ReviewAnswer } from "../../domain/dev/review-answer.ts";
import { reviewSystem } from "../../domain/dev/prompts.ts";
import { buildReviewAnswerPrompt, buildReviewBrief } from "../../domain/dev/review-brief.ts";
import { numberQuestions, reviewDrafts, withQuestionSections } from "../../domain/dev/questions.ts";
import type { RoundState } from "./question-round.ts";
import { addedAsOpenQuestions, reviewCounts, reviewNotRun } from "./messages.ts";

export interface SourceReviewRequest {
  mode: "spec" | "change";
  /** "spec" or "brief": the target naming the whole file. */
  whole: string;
  folder: string;
  fileShown: string;
  origin: string;
  inventory: string;
  ids: readonly string[];
  headings: { questions: string; decisions: string };
}

export type SourceReviewOutcome =
  | { ran: true; review: ReviewAnswer; state: RoundState; added: string[] }
  | { ran: false; reason: string };

export async function reviewSource(
  llm: Pick<Llm, "act" | "extract">, state: RoundState, request: SourceReviewRequest, write: (text: string) => Promise<void>,
  route?: ActRoute,
): Promise<SourceReviewOutcome> {
  const targets = [request.whole, ...request.ids];
  const outcome = await runSubAgent(llm, {
    charter: REVIEWER_CHARTER,
    system: reviewSystem(request.mode),
    brief: buildReviewBrief({
      mode: request.mode, folder: request.folder, files: [request.fileShown], source: request.origin,
      inventory: request.inventory, targets,
    }),
    schema: REVIEW_ANSWER_SCHEMA,
    answerPrompt: (reply, problems) => buildReviewAnswerPrompt(reply, problems, targets),
    ...reviewChecks(targets),
  }, route);
  if (!outcome.ok) return { ran: false, reason: `${outcome.reason}: ${outcome.problems[0] ?? "no detail"}` };
  const review = outcome.value;
  if (review.rows.length === 0) return { ran: true, review, state, added: [] };
  const before = new Set(state.open.map((q) => q.id));
  const open = numberQuestions(reviewDrafts(review.rows, request.whole), state.decisions, state.open);
  const added = open.filter((q) => !before.has(q.id)).map((q) => q.id);
  if (added.length === 0) return { ran: true, review, state, added };
  const text = withQuestionSections(state.text, open, state.decisions, request.headings);
  await write(text);
  return { ran: true, review, state: { text, open, decisions: state.decisions }, added };
}

export function reviewLine(outcome: SourceReviewOutcome): string {
  if (!outcome.ran) return reviewNotRun(outcome.reason);
  const rows = outcome.review.rows;
  if (rows.length === 0) return `review: ${outcome.review.verdict}`;
  const blocking = rows.filter((r) => r.severity === "Blocking").length;
  const kept = outcome.added.length === rows.length ? "" : addedAsOpenQuestions(outcome.added.length);
  return reviewCounts(outcome.review.verdict, blocking, rows.length - blocking, kept);
}

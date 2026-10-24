// One round of questions on a written spec or change brief: the questions asked one at a time (settleQuestions),
// the file's open-questions and decisions sections rewritten and written after each answer, then - when anything
// was decided - one fold: the caller's model call rewrites the body with the decisions, and the folded file is
// written. A fold that fails leaves the decisions recorded in their section and says so in a warning: an answer a
// person gave is never lost.
import type { HumanInput } from "../ports.ts";
import { withQuestionSections } from "../../domain/dev/questions.ts";
import type { Decision, Question } from "../../domain/dev/questions.ts";
import { settleQuestions } from "./settle-questions.ts";

export interface RoundState { text: string; open: Question[]; decisions: Decision[] }
export type Folded = { ok: true; text: string; open: Question[] } | { ok: false; problems: string[] };

export interface RoundDeps {
  human: HumanInput;
  today: string;
  /** The label of each question ("dev-spec prune"). */
  label: string;
  /** The headings the two sections are written under ("## 12. Open questions", "## 13. Decisions"). */
  headings: { questions: string; decisions: string };
  write: (text: string) => Promise<void>;
  /** Rewrites the body with the decisions of the round; `open` are the questions still open. */
  fold: (state: RoundState, fresh: readonly Decision[]) => Promise<Folded>;
}

export interface RoundOutcome { state: RoundState; made: Decision[]; blocked: boolean; warnings: string[] }

export async function questionRound(
  state: RoundState, deps: RoundDeps, which: (q: Question) => boolean = () => true,
): Promise<RoundOutcome> {
  let text = state.text;
  const settled = await settleQuestions(deps.label, state.open, state.decisions, {
    human: deps.human, today: deps.today,
    save: async (open, decisions) => {
      text = withQuestionSections(text, open, decisions, deps.headings);
      await deps.write(text);
    },
  }, which);
  let next: RoundState = { text, open: settled.open, decisions: settled.decisions };
  const warnings: string[] = [];
  if (settled.made.length > 0) {
    const folded = await deps.fold(next, settled.made);
    if (folded.ok) {
      next = { ...next, text: folded.text, open: folded.open };
      await deps.write(folded.text);
    } else {
      warnings.push(`the body does not say the decisions yet (${folded.problems[0] ?? "the rewrite was refused"}); ` +
        "they are recorded under Decisions");
    }
  }
  return { state: next, made: settled.made, blocked: settled.blocked, warnings };
}

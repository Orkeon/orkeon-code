// One round of questions on a written spec or change brief: the questions asked one at a time (settleQuestions),
// the file's open-questions and decisions sections rewritten and written after each answer, then - when anything
// was decided and the caller gave a fold - one fold: the caller's model call rewrites the body with the decisions,
// and the folded file is written (foldDecisions). A caller that gives none folds itself, once, when its rounds are
// over. A fold that fails leaves the decisions recorded in their section and says so in a warning: an answer a
// person gave is never lost.
import type { HumanInput } from "../ports.ts";
import { withQuestionSections } from "../../domain/dev/questions.ts";
import type { Decision, Question } from "../../domain/dev/questions.ts";
import { settleQuestions } from "./settle-questions.ts";
import { REWRITE_REFUSED, decisionsNotFolded } from "./messages.ts";

export interface RoundState { text: string; open: Question[]; decisions: Decision[] }
export type Folded = { ok: true; text: string; open: Question[] } | { ok: false; problems: string[] };

export type Fold = (state: RoundState, fresh: readonly Decision[]) => Promise<Folded>;

export interface RoundDeps {
  human: HumanInput;
  today: string;
  /** The label of each question ("dev-spec prune"). */
  label: string;
  /** The headings the two sections are written under ("## 12. Open questions", "## 13. Decisions"). */
  headings: { questions: string; decisions: string };
  write: (text: string) => Promise<void>;
  /** Rewrites the body with the decisions of the round; `open` are the questions still open. Absent: the round
   *  records the answers and rewrites nothing. */
  fold?: Fold;
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
  const next: RoundState = { text, open: settled.open, decisions: settled.decisions };
  if (deps.fold === undefined) return { state: next, made: settled.made, blocked: settled.blocked, warnings: [] };
  const folded = await foldDecisions(next, settled.made, deps.fold, deps.write);
  return { state: folded.state, made: settled.made, blocked: settled.blocked, warnings: folded.warnings };
}

/** One fold of `made` into the body of `state`, the folded file written: nothing to do when nothing was decided, a
 *  warning and the state as it was when the rewrite is refused. */
export async function foldDecisions(
  state: RoundState, made: readonly Decision[], fold: Fold, write: (text: string) => Promise<void>,
): Promise<{ state: RoundState; warnings: string[] }> {
  if (made.length === 0) return { state, warnings: [] };
  const folded = await fold(state, made);
  if (!folded.ok) return { state, warnings: [decisionsNotFolded(folded.problems[0] ?? REWRITE_REFUSED)] };
  await write(folded.text);
  return { state: { ...state, text: folded.text, open: folded.open }, warnings: [] };
}

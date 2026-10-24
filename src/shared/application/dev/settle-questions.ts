// The questions of a spec or a change brief asked to the person, one at a time, Blocking first: a question with
// options is a choice (the recommended answer first, then the others, then "Leave it open"), one without is free
// text. Each answer becomes a decision and its row leaves the open questions, and the file is written (`save`)
// before the next question is asked. When nobody answers (an unattended run, an empty text) the asking stops at
// once: nothing is decided on anyone's behalf, the questions stay in the file and the step reads BLOCKED.
import type { HumanInput } from "../ports.ts";
import { LEAVE_OPEN, askingOrder, decide, questionPrompt } from "../../domain/dev/questions.ts";
import type { Decision, Question } from "../../domain/dev/questions.ts";

export interface SettleDeps {
  human: HumanInput;
  /** The day a decision is recorded, yyyy-mm-dd. */
  today: string;
  /** Writes the file with these open questions and decisions; a throw stops the asking and is the caller's. */
  save: (open: Question[], decisions: Decision[]) => Promise<void>;
}

export interface Settled {
  open: Question[];
  decisions: Decision[];
  /** The decisions of this call, in the order they were made. */
  made: Decision[];
  /** True when nobody answered a question that was asked. */
  blocked: boolean;
}

/** Asks the open questions `which` selects (all by default), in asking order. */
export async function settleQuestions(
  label: string, open: readonly Question[], decisions: readonly Decision[], deps: SettleDeps,
  which: (q: Question) => boolean = () => true,
): Promise<Settled> {
  let left = [...open];
  let all = [...decisions];
  const made: Decision[] = [];
  for (const q of askingOrder(open).filter(which)) {
    const prompt = questionPrompt(label, q);
    let answer: string | null;
    if (q.options.length > 0) {
      const r = await deps.human.choice(prompt, [...q.options, LEAVE_OPEN]);
      if (!r.answered) return { open: left, decisions: all, made, blocked: true };
      answer = r.value === LEAVE_OPEN ? null : r.value;
    } else {
      const r = await deps.human.text(`${prompt}\n(an empty answer leaves the questions in the file)`);
      if (!r.answered) return { open: left, decisions: all, made, blocked: true };
      answer = r.value;
    }
    if (answer === null) continue;
    const decision = decide(q, answer, deps.today);
    left = left.filter((o) => o.id !== q.id);
    all = [...all, decision];
    made.push(decision);
    await deps.save(left, all);
  }
  return { open: left, decisions: all, made, blocked: false };
}

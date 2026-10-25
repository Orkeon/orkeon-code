// The questions and the scripted person settleQuestions and questionRound are tested with.
import type { HumanInput } from "../ports.ts";
import type { Question } from "../../domain/dev/questions.ts";
import type { RoundState } from "./question-round.ts";

export const Q1: Question = { id: "Q1", severity: "Major", question: "A?", impact: "", options: ["Yes", "No"] };
export const Q2: Question = { id: "Q2", severity: "Blocking", question: "B?", impact: "", options: [] };
export const Q3: Question = { id: "Q3", severity: "Major", question: "C?", impact: "", options: ["X", "Y"] };

/**
 * A person answering from `script`, one answer per question asked (null, or the script run out: nobody answers),
 * each question logged in `log` as "ask <id>".
 */
export function person(script: Array<string | null>, log: string[]): HumanInput {
  const answer = (p: string) => {
    log.push(`ask ${p.split(" — ")[1].split(" ")[0]}`);
    const a = script.shift();
    return a === undefined || a === null ? null : a;
  };
  return {
    async choice(p) { const a = answer(p); return a === null ? { answered: false } : { answered: true, value: a }; },
    async text(p) { const a = answer(p); return a === null ? { answered: false } : { answered: true, value: a }; },
    async multi() { return { answered: false }; },
  };
}

/** A file holding Q1 open and no decision yet. */
export function roundStart(): RoundState {
  return { text: "# x — Y\n", open: [Q1], decisions: [] };
}

export const ROUND_HEADINGS = { questions: "## 12. Open questions", decisions: "## 13. Decisions" };

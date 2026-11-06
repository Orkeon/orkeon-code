// FakeChooser: the Chooser port answering from a script. Every question lands in `asked`; `answers` are taken in
// order, a string being that option with no control, and null, or an empty script, the person leaving.
import type { ChoiceQuestion, Chooser } from "../../../src/shared/application/ports.ts";

export type ChooserAnswer = { value: string; control: string | null } | string | null;

export class FakeChooser implements Chooser {
  interactive = true;
  answers: ChooserAnswer[] = [];
  asked: ChoiceQuestion[] = [];

  async choose(question: ChoiceQuestion): Promise<{ value: string; control: string | null } | null> {
    this.asked.push(question);
    const answer = this.answers.shift() ?? null;
    return typeof answer === "string" ? { value: answer, control: null } : answer;
  }
}

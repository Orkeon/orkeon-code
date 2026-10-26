// FakeHumanInput: the HumanInput port answering from a script. Every question lands in `asked` (its kind, prompt and
// options; a text has none) and is handed to `onAsk`, where a test takes its snapshot of the moment. `pick`, when
// set, answers each question; otherwise `answers` are taken in order. A string answers (a multi-select gets it as
// its one value), a string array answers a multi-select (a choice or a text gets its first value), null, an empty
// script or a missing first value is nobody answering. A `pick` that throws makes the question throw.
import type { HumanInput } from "../../../src/shared/application/ports.ts";

export type HumanQuestion = { kind: "choice" | "text" | "multi"; prompt: string; options: readonly string[] };
export type HumanAnswer = string | string[] | null;

export class FakeHumanInput implements HumanInput {
  answers: HumanAnswer[] = [];
  pick: ((question: HumanQuestion) => HumanAnswer) | null = null;
  onAsk: ((question: HumanQuestion) => void) | null = null;
  asked: HumanQuestion[] = [];

  answer(question: HumanQuestion): HumanAnswer {
    this.asked.push(question);
    this.onAsk?.(question);
    if (this.pick) return this.pick(question);
    return this.answers.length === 0 ? null : this.answers.shift() ?? null;
  }

  single(question: HumanQuestion): { answered: true; value: string } | { answered: false } {
    const a = this.answer(question);
    const value = Array.isArray(a) ? a[0] : a;
    return value === null || value === undefined ? { answered: false } : { answered: true, value };
  }

  async choice(prompt: string, options: readonly string[]): Promise<{ answered: true; value: string } | { answered: false }> {
    return this.single({ kind: "choice", prompt, options });
  }

  async text(prompt: string): Promise<{ answered: true; value: string } | { answered: false }> {
    return this.single({ kind: "text", prompt, options: [] });
  }

  async multi(prompt: string, options: readonly string[]): Promise<{ answered: true; values: string[] } | { answered: false }> {
    const a = this.answer({ kind: "multi", prompt, options });
    if (a === null) return { answered: false };
    return { answered: true, values: Array.isArray(a) ? a : [a] };
  }
}

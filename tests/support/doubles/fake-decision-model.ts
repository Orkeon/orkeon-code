// FakeDecisionModel: the DecisionModel port. `answers` holds what the model says, by question name; `ask` returns
// the entry of each question asked, or null as soon as one is missing, as a model that failed does. `replies`,
// when it holds something, wins: one whole reply per request, in order (null: that request fails). `present:
// false` plays a host without a decision model. Every request lands in `asked`.
import type { DecisionModel } from "../../../src/shared/application/ports.ts";
import type { DecisionAnswer, DecisionAnswers, DecisionQuestions } from "../../../src/shared/domain/decision/questions.ts";

export class FakeDecisionModel implements DecisionModel {
  present = true;
  answers: Record<string, DecisionAnswer> = {};
  replies: Array<DecisionAnswers | null> = [];
  asked: Array<{ state: unknown; questions: DecisionQuestions }> = [];

  available(): boolean {
    return this.present;
  }

  async ask(state: unknown, questions: DecisionQuestions): Promise<DecisionAnswers | null> {
    if (!this.present) return null;
    this.asked.push({ state, questions });
    if (this.replies.length > 0) return this.replies.shift() ?? null;
    const out: DecisionAnswers = {};
    for (const name of Object.keys(questions)) {
      const answer = this.answers[name];
      if (answer === undefined) return null;
      out[name] = answer;
    }
    return out;
  }
}

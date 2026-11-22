// FakeProfilePicker: the ProfilePicker port. `answer` is what every pick resolves to (null: a host without the pick,
// or an option refused); `answerFor`, when set, wins and answers from the options given, as the runtime holds a pick
// between its bounds. Every request lands in `asked`, with its options.
import type { ProfilePick, ProfilePickOptions, ProfilePicker } from "../../../src/shared/application/ports.ts";

export class FakeProfilePicker implements ProfilePicker {
  answer: ProfilePick | null = { value: "small", reason: "model", picked: "small", probability: 0.9 };
  answerFor: ((options: ProfilePickOptions) => ProfilePick | null) | null = null;
  asked: Array<{ request: string; options: ProfilePickOptions }> = [];

  async pick(request: string, options: ProfilePickOptions): Promise<ProfilePick | null> {
    this.asked.push({ request, options });
    return this.answerFor === null ? this.answer : this.answerFor(options);
  }
}

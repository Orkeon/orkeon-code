// FakeProfilePicker: the ProfilePicker port. `answer` is what every pick resolves to (null: a host without the pick;
// `{ refused }`: an option the runtime refused); `answerFor`, when set, wins and answers from the options given, as the runtime holds a pick
// between its bounds. Every request lands in `asked`, with its options.
import type { ProfilePick, ProfilePickRefusal, ProfilePicker } from "../../../src/shared/application/ports.ts";
import type { RouteBounds } from "../../../src/shared/domain/agents/model-route.ts";

export class FakeProfilePicker implements ProfilePicker {
  answer: ProfilePick | ProfilePickRefusal | null = { value: "small", reason: "model", picked: "small", probability: 0.9 };
  answerFor: ((options: RouteBounds) => ProfilePick | ProfilePickRefusal | null) | null = null;
  asked: Array<{ request: string; options: RouteBounds }> = [];

  async pick(request: string, options: RouteBounds): Promise<ProfilePick | ProfilePickRefusal | null> {
    this.asked.push({ request, options });
    return this.answerFor === null ? this.answer : this.answerFor(options);
  }
}

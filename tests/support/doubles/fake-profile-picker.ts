// FakeProfilePicker: the ProfilePicker port. `answer` is what every pick resolves to (null: a host without the pick;
// `{ refused }`: an option the runtime refused); `answerFor`, when set, wins and answers from the options given and the
// bounds of the level (undefined: none asked), as the runtime holds a pick between its bounds. `failure`, when set, is
// thrown by `pick`, as an adapter that breaks its word. Every request lands in `asked`, with its options, and the bounds
// of the thinking level when the pick was asked one.
import type { ProfilePick, ProfilePickRefusal, ProfilePicker } from "../../../src/shared/application/ports.ts";
import type { EffortBounds, RouteBounds } from "../../../src/shared/domain/agents/model-route.ts";

export class FakeProfilePicker implements ProfilePicker {
  answer: ProfilePick | ProfilePickRefusal | null = { value: "small", reason: "model", picked: "small", probability: 0.9 };
  answerFor: ((options: RouteBounds, effort?: EffortBounds) => ProfilePick | ProfilePickRefusal | null) | null = null;
  failure: Error | null = null;
  asked: Array<{ request: string; options: RouteBounds; effort?: EffortBounds }> = [];

  async pick(request: string, options: RouteBounds, effort?: EffortBounds): Promise<ProfilePick | ProfilePickRefusal | null> {
    this.asked.push({ request, options, ...(effort === undefined ? {} : { effort }) });
    if (this.failure) throw this.failure;
    return this.answerFor === null ? this.answer : this.answerFor(options, effort);
  }
}

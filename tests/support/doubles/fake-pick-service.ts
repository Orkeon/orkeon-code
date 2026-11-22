// FakePickService: the runtime's System One pick, as a command's `pick` service (PickService of the CLI typings) and
// as a crew's `ctx.llm.pick` alike, to test the ProfilePicker adapters. `reply` is what pick() resolves to; `failure`,
// when set, is thrown, as the runtime throws on an option it refuses. Every call lands in `calls`.
import type { PickOptions, PickResult, PickService } from "../../../src/commands/.orkeon/orkeon-cli.d.ts";

export class FakePickService implements PickService {
  reply: unknown = { profile: { value: "small", reason: "model", picked: "small", probability: 0.9 } };
  failure: Error | null = null;
  calls: Array<{ request: string; options: PickOptions }> = [];

  async pick(request: string, options: PickOptions): Promise<PickResult> {
    this.calls.push({ request, options });
    if (this.failure) throw this.failure;
    return this.reply as PickResult;
  }
}

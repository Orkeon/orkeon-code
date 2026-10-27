// FakeUsageReader: the UsageReader port. `answer` is what report() answers: undefined (the default)
// plays a host that keeps no account of the session's usage.
import type { UsageReader, UsageReport } from "../../../src/shared/application/ports.ts";

export class FakeUsageReader implements UsageReader {
  answer: UsageReport | undefined = undefined;

  report(): UsageReport | undefined {
    return this.answer;
  }
}

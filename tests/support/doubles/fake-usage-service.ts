// FakeUsageService: orkeon-repl's `usage` service (SessionUsage of the CLI typings), to test the
// adapter. `answer` is what report() gives, as the host would.
import type { SessionUsage, SessionUsageReport } from "../../../src/commands/.orkeon/orkeon-cli.d.ts";

export class FakeUsageService implements SessionUsage {
  answer: SessionUsageReport = {
    promptTokens: 0, completionTokens: 0, cacheHitTokens: null, cacheWriteTokens: null, reasoningTokens: null,
    totalTokens: 0, calls: 0, unpricedCalls: 0, cost: null, byModel: [], byCommand: [],
  };

  report(): SessionUsageReport {
    return this.answer;
  }
}

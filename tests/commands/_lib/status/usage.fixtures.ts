// The harness /usage runs over (FakeSessionStore, FakeTelemetry, a settings reader, a FakeUsageReader), and a
// report with one model and two commands.
import type { ConfigResolution } from "../../../../src/shared/domain/config-schema.ts";
import { runUsage } from "../../../../src/commands/_lib/status/usage.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeTelemetry } from "../../../support/doubles/fake-telemetry.ts";
import { FakeUsageReader } from "../../../support/doubles/fake-usage-reader.ts";
import { USAGE_REPORT } from "../../../support/fixtures/usage-report.ts";

/** runUsage over fresh fakes; `trigger` is what the settings answer for compaction.trigger. */
export function usageHarness(trigger?: string) {
  const session = new FakeSessionStore();
  const telemetry = new FakeTelemetry();
  const usage = new FakeUsageReader();
  const config = {
    readValue: async (key: string): Promise<ConfigResolution> => ({ key, value: trigger, source: trigger === undefined ? "unset" : "file" }),
  };
  return { session, telemetry, usage, run: () => runUsage({ session, telemetry, config, usage }) };
}

/** The breakdown of USAGE_REPORT, line by line. */
export const REPORT_BREAKDOWN = [
  "by model:",
  "  deepseek-chat: 2 call(s), 3000 prompt (2000 from the cache), 400 completion, $0.0100",
  "by command:",
  "  [t2] commit (running): 1 call(s), 1000 prompt, 100 completion, cost unpriced",
  "  [t1] assistant (done): 1 call(s), 2000 prompt (2000 from the cache), 300 completion, $0.0100",
  "1 call(s) unpriced: the cost is a lower bound",
].join("\n");

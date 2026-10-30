// The harness /usage runs over (FakeSessionStore, FakeTelemetry, a settings reader, a FakeUsageReader), and a
// report with one model and two commands.
import type { SessionStats, UsageReport } from "../../../../src/shared/application/ports.ts";
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

/** The cache ratio /usage shows for the telemetry's stats: the cache read over the prompt tokens. */
export const CACHE_RATIO_CASES: { name: string; stats: SessionStats; ratio: string }[] = [
  {
    name: "gives the share of the prompt tokens read from the cache to two decimals",
    stats: { totalTokens: 9000, promptTokens: 8000, cacheHitTokens: 700 }, ratio: "0.09",
  },
  { name: "gives no cache ratio when the host reports no cache", stats: { promptTokens: 8000 }, ratio: "-" },
  { name: "gives no cache ratio when the host reports no prompt tokens", stats: { totalTokens: 9000, cacheHitTokens: 700 }, ratio: "-" },
  { name: "gives no cache ratio before any prompt token", stats: { promptTokens: 0, cacheHitTokens: 0 }, ratio: "-" },
];

/** The tokens sent, received and spent reasoning, as /usage tables them. */
export interface InOut {
  llmInTokens: number | "-";
  llmOutTokens: number | "-";
  llmReasoningTokens: number | "-";
}

/** Where /usage takes the tokens sent and received: the host's account first, the telemetry's sums, else unreported. */
export const IN_OUT_CASES: { name: string; stats: SessionStats; report?: UsageReport; expected: InOut }[] = [
  {
    name: "takes the tokens sent, received and spent reasoning from the host's account, over the telemetry",
    stats: { promptTokens: 1, completionTokens: 1 },
    report: { ...USAGE_REPORT, reasoningTokens: 120 },
    expected: { llmInTokens: 3000, llmOutTokens: 400, llmReasoningTokens: 120 },
  },
  {
    name: "takes the tokens sent and received from the telemetry when the host keeps no account",
    stats: { promptTokens: 8000, completionTokens: 1000 },
    expected: { llmInTokens: 8000, llmOutTokens: 1000, llmReasoningTokens: "-" },
  },
  {
    name: "shows the tokens sent and received unreported when no source counts them",
    stats: { totalTokens: 9000 },
    expected: { llmInTokens: "-", llmOutTokens: "-", llmReasoningTokens: "-" },
  },
];

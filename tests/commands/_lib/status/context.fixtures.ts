// The harness /context runs over (FakeSessionStore, FakeTelemetry, FakeUsageReader), and where its cache columns come from.
import type { SessionStats, UsageReport } from "../../../../src/shared/application/ports.ts";
import { runContext } from "../../../../src/commands/_lib/status/context.ts";
import type { CacheColumns } from "../../../../src/commands/_lib/status/cache.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeTelemetry } from "../../../support/doubles/fake-telemetry.ts";
import { FakeUsageReader } from "../../../support/doubles/fake-usage-reader.ts";
import { USAGE_REPORT } from "../../../support/fixtures/usage-report.ts";

export function contextHarness() {
  const session = new FakeSessionStore();
  const telemetry = new FakeTelemetry();
  const usage = new FakeUsageReader();
  return { session, telemetry, usage, run: () => runContext({ session, telemetry, usage }) };
}

export const KINDS = { system: 4000, user: 1000, assistant: 2000, tool: 900, other: 100 };

/** Where /context takes its cache columns: the host's account alone when it keeps one, else the telemetry's sums. */
export const CONTEXT_CACHE_CASES: { name: string; stats: SessionStats; report?: UsageReport; expected: CacheColumns }[] = [
  {
    name: "takes the cache read and write from the host's account, over the telemetry",
    stats: { cacheHitTokens: 5, cacheWriteTokens: 7 }, report: USAGE_REPORT, expected: { cacheRead: 2000, cacheWrite: 0 },
  },
  {
    name: "shows the cache read and write unreported, not the telemetry's, when the host's account did not measure them",
    stats: { cacheHitTokens: 5, cacheWriteTokens: 7 },
    report: { ...USAGE_REPORT, cacheHitTokens: null, cacheWriteTokens: null },
    expected: { cacheRead: "n/a", cacheWrite: "n/a" },
  },
  {
    name: "takes the cache read and write from the telemetry when the host keeps no account",
    stats: { cacheHitTokens: 5, cacheWriteTokens: 7 }, expected: { cacheRead: 5, cacheWrite: 7 },
  },
];

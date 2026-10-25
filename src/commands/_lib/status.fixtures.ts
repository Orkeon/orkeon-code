// The harness /status runs over (FakeSessionStore, FakeTelemetry, FakeCrewHost, a FakeShell when given), the
// row reader, and the cases of the cache columns.
import { runStatus } from "./status.ts";
import type { cacheColumns } from "./cache.ts";
import { FakeCrewHost } from "../../../tests/support/doubles/fake-crew-host.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../tests/support/doubles/fake-shell.ts";
import { FakeTelemetry } from "../../../tests/support/doubles/fake-telemetry.ts";

/** The rows of a /status table, by field. */
export function rowMap(table: unknown): Map<string, string> {
  return new Map((table as Array<{ field: string; value: string }>).map((r) => [r.field, r.value]));
}

/** runStatus over fresh fakes; `extra` adds a shell or a provider reader. */
export function statusHarness(extra: { shell?: FakeShell; provider?: () => string } = {}) {
  const session = new FakeSessionStore();
  const telemetry = new FakeTelemetry();
  const crews = new FakeCrewHost();
  const deps = { session, telemetry, crews, ...extra };
  return { session, telemetry, crews, run: () => runStatus(deps) };
}

export const CACHE_COLUMN_CASES: readonly { name: string; stats: Parameters<typeof cacheColumns>[0]; expected: object }[] = [
  { name: "shows the read and write tokens", stats: { cacheHitTokens: 700, cacheWriteTokens: 50 }, expected: { cacheRead: 700, cacheWrite: 50 } },
  { name: "shows zero tokens as zero", stats: { cacheHitTokens: 0, cacheWriteTokens: 0 }, expected: { cacheRead: 0, cacheWrite: 0 } },
  { name: "shows `-` when unreported", stats: {}, expected: { cacheRead: "-", cacheWrite: "-" } },
];

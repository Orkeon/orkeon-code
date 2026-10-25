// The harness /status runs over (FakeSessionStore, FakeTelemetry, FakeCrewHost, a FakeShell when given), the
// row reader, and the cases of the provider reader and the cache columns.
import { runStatus } from "../src/commands/_lib/status.ts";
import type { cacheColumns } from "../src/commands/_lib/cache.ts";
import type { readHostProvider } from "../src/shared/infrastructure/orkeon/host-provider.ts";
import { FakeCrewHost } from "./support/fake-crew-host.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeShell } from "./support/fake-shell.ts";
import { FakeTelemetry } from "./support/fake-telemetry.ts";

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

type Services = Parameters<typeof readHostProvider>[0];

const services = (llm: unknown, has = true): Services => ({ has: () => has, get: <T>() => llm as T });

export const PROVIDER_CASES: readonly { name: string; services: Services; expected: string | undefined }[] = [
  { name: "reads the llm service's CLR Name", services: services({ Name: "deepseek" }), expected: "deepseek" },
  { name: "reads a lower-case name, trimmed", services: services({ name: " OpenAI " }), expected: "OpenAI" },
  { name: "reads nothing from an empty name", services: services({ Name: "" }), expected: undefined },
  { name: "reads nothing when the host wires no llm service", services: services({ Name: "x" }, false), expected: undefined },
  {
    name: "reads nothing when the read throws",
    services: { has: () => true, get: () => { throw new Error("not whitelisted"); } },
    expected: undefined,
  },
];

export const CACHE_COLUMN_CASES: readonly { name: string; stats: Parameters<typeof cacheColumns>[0]; expected: object }[] = [
  { name: "shows the read and write tokens", stats: { cacheHitTokens: 700, cacheWriteTokens: 50 }, expected: { cacheRead: 700, cacheWrite: 50 } },
  { name: "shows zero tokens as zero", stats: { cacheHitTokens: 0, cacheWriteTokens: 0 }, expected: { cacheRead: 0, cacheWrite: 0 } },
  { name: "shows `-` when unreported", stats: {}, expected: { cacheRead: "-", cacheWrite: "-" } },
];

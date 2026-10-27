// The harness /context runs over (FakeSessionStore, FakeTelemetry).
import { runContext } from "../../../../src/commands/_lib/status/context.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeTelemetry } from "../../../support/doubles/fake-telemetry.ts";

export function contextHarness() {
  const session = new FakeSessionStore();
  const telemetry = new FakeTelemetry();
  return { session, telemetry, run: () => runContext({ session, telemetry }) };
}

export const KINDS = { system: 4000, user: 1000, assistant: 2000, tool: 900, other: 100 };

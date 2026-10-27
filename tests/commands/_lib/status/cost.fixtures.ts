// The harness /cost runs over (FakeTelemetry, FakeUsageReader).
import { runCost } from "../../../../src/commands/_lib/status/cost.ts";
import { FakeTelemetry } from "../../../support/doubles/fake-telemetry.ts";
import { FakeUsageReader } from "../../../support/doubles/fake-usage-reader.ts";

export function costHarness() {
  const telemetry = new FakeTelemetry();
  const usage = new FakeUsageReader();
  return { telemetry, usage, run: () => runCost({ telemetry, usage }) };
}

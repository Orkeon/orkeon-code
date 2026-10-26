// Checks on the waves batchWaves returns.
import { ok, strictEqual } from "node:assert";
import type { Waves } from "../../../../src/crews/dev-batches/domain/batch-waves.ts";

/** `waves` is a refusal naming an unknown dependency or a cycle. */
export function assertWavesRefused(waves: Waves): void {
  strictEqual(waves.ok, false, "the plan was not refused");
  ok(!waves.ok && /unknown dependency|cycle/.test(waves.problem), `the refusal names neither an unknown dependency nor a cycle: ${JSON.stringify(waves)}`);
}

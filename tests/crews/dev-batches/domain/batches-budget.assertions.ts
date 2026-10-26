// Checks on the limits a batch of a wave is given.
import { deepStrictEqual, ok } from "node:assert";
import type { BatchLimits } from "../../../../src/crews/dev-batches/domain/batches-budget.ts";

/** `limits` names only the runtime's budget keys, each a whole number of 1 or more. */
export function assertRuntimeLimits(limits: BatchLimits, label: string): void {
  deepStrictEqual(Object.keys(limits).sort(), ["tokens", "toolCalls", "wallTime"], `${label}: keys other than the runtime's`);
  for (const v of Object.values(limits)) ok(Number.isSafeInteger(v) && v >= 1, `${label}: ${v} is no whole number of 1 or more`);
}

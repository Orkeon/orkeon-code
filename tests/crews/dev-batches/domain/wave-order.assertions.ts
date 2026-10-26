// Checks on what waveOrder returns.
import { ok, strictEqual } from "node:assert";
import type { WaveOrder } from "../../../../src/crews/dev-batches/domain/wave-order.ts";

/** `order` is a refusal that names its problem. */
export function assertRefused(order: WaveOrder): void {
  strictEqual(order.ok, false, "the order was not refused");
  ok(!order.ok && order.problem.length > 0, "the refusal names no problem");
}

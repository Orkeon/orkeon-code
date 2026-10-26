// Checks on the access cost: which state it is in.
import { strictEqual } from "node:assert";
import type { AccessCost } from "../../../../src/shared/domain/dev/access-cost.ts";

type Measured = Extract<AccessCost, { state: "measured" }>;
type NotComputed = Extract<AccessCost, { state: "not-computed" }>;

/** `cost` was measured. */
export function assertMeasured(cost: AccessCost): asserts cost is Measured {
  strictEqual(cost.state, "measured", "the cost was not measured");
}

/** `cost` was not computed. */
export function assertNotComputed(cost: AccessCost): asserts cost is NotComputed {
  strictEqual(cost.state, "not-computed", "the cost was computed");
}

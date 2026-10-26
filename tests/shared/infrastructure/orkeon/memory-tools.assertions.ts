// Checks on what the memory tools answer the model.
import { ok } from "node:assert";

/** `out` is a refusal whose reason mentions `reason`. */
export function assertRefusedWith(out: { refused?: unknown }, reason: string): void {
  ok(typeof out.refused === "string", `not a refusal: ${JSON.stringify(out)}`);
  ok(out.refused.includes(reason), `the refusal does not say "${reason}": ${out.refused}`);
}

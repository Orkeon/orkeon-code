// Checks on the outcome of the documentation parity check.
import { match, strictEqual } from "node:assert";
import type { CheckResult } from "./docs-parity.fixtures.ts";

/** The check exited with `status` and its output says `says`. */
export function assertOutcome(result: CheckResult, status: number, says: RegExp): void {
  strictEqual(result.status, status, result.output);
  match(result.output, says, `the output does not say ${says}: ${result.output}`);
}

// Checks on the call guard's verdicts.
import { deepStrictEqual, ok } from "node:assert";
import type { CallVerdict } from "./call-guard.ts";

export type Refusal = Extract<CallVerdict, { allow: false }>;

/** The call was refused. */
export function assertRefused(verdict: CallVerdict, label = ""): asserts verdict is Refusal {
  ok(!verdict.allow, `the call was allowed${label ? `: ${label}` : ""}`);
}

/** The call was allowed, and nothing more was said. */
export function assertAllowed(verdict: CallVerdict, label?: string): void {
  deepStrictEqual(verdict, { allow: true }, label);
}

/** `verdict` as a refusal; fails when the call was allowed. */
export function refused(verdict: CallVerdict): Refusal {
  assertRefused(verdict);
  return verdict;
}

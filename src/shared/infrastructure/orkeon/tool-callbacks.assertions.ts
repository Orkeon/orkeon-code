// Checks on the verdicts of the tool callbacks.
import { ok } from "node:assert";

import type { ToolCallVerdict } from "./tool-callbacks.ts";

/** `verdict` is a refusal whose reason mentions every text of `mentions` and none of `lacks`. */
export function assertDenied(verdict: ToolCallVerdict, mentions: readonly string[], lacks: readonly string[] = []): void {
  ok(typeof verdict === "object", `not a refusal: ${JSON.stringify(verdict)}`);
  for (const text of mentions) ok(verdict.deny.includes(text), `the refusal does not say "${text}": ${JSON.stringify(verdict)}`);
  for (const text of lacks) ok(!verdict.deny.includes(text), `the refusal says "${text}": ${JSON.stringify(verdict)}`);
}

/** `verdict` is a refusal whose reason starts with `prefix`. */
export function assertDeniedWith(verdict: ToolCallVerdict, prefix: string): void {
  ok(typeof verdict === "object" && verdict.deny.startsWith(prefix), `not a refusal starting "${prefix}": ${JSON.stringify(verdict)}`);
}

// Checks on what parseToolCallArgs answers.
import { ok, strictEqual } from "node:assert";
import type { ParsedToolCall } from "../src/commands/_lib/args.ts";

/** `result` is a refusal whose reason names every fragment of `fragments`. */
export function assertRefused(result: ParsedToolCall, fragments: readonly string[] = [], label = ""): void {
  strictEqual(result.ok, false, `the call was accepted: ${label}`);
  if (result.ok) return;
  for (const fragment of fragments) {
    ok(result.reason.includes(fragment), `the reason does not name "${fragment}": ${result.reason}`);
  }
}

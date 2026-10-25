// Checks on the line describeActiveFlags writes.
import { ok } from "node:assert";

/** `line` mentions every one of `parts`. */
export function assertMentions(line: string, parts: readonly string[]): void {
  for (const part of parts) ok(line.includes(part), `"${part}" missing from: ${line}`);
}

/** `line` mentions none of `parts`. */
export function assertOmits(line: string, parts: readonly string[]): void {
  for (const part of parts) ok(!line.includes(part), `"${part}" should not be in: ${line}`);
}

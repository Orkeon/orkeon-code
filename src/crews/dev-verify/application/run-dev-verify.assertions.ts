// Checks on the texts runDevVerify returned, wrote and sent to the auditor.
import { ok } from "node:assert";

/** `text` holds each of `parts` as written. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `the text lacks ${JSON.stringify(part)}:\n${text}`);
}

/** `text` holds none of `parts`. */
export function assertOmits(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(!text.includes(part), `the text holds ${JSON.stringify(part)}:\n${text}`);
}

/** `text` holds `first`, and `second` after it. */
export function assertBefore(text: string, first: string, second: string): void {
  const at = text.indexOf(first);
  ok(at >= 0, `the text lacks ${JSON.stringify(first)}:\n${text}`);
  ok(at < text.indexOf(second), `${JSON.stringify(first)} does not come before ${JSON.stringify(second)}:\n${text}`);
}

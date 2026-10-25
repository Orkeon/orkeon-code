// Checks on the texts the advice module builds.
import { ok } from "node:assert";

/** `text` holds each of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `missing ${JSON.stringify(part)} in: ${text}`);
}

/** `text` holds none of `parts`. */
export function assertOmits(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(!text.includes(part), `unexpected ${JSON.stringify(part)} in: ${text}`);
}

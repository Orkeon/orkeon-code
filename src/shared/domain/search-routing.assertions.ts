// Checks of the search routing tests.
import { ok } from "node:assert";

/** `text` holds every one of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const p of parts) ok(text.includes(p), `expected the text to mention ${JSON.stringify(p)}:\n${text}`);
}

/** `list` holds every one of `items`. */
export function assertHoldsEvery(list: readonly string[], items: readonly string[]): void {
  for (const item of items) ok(list.includes(item), `${item} is missing from ${JSON.stringify(list)}`);
}

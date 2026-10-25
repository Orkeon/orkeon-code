// Checks of the /summary request tests.
import { ok } from "node:assert";

/** `text` holds every one of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const p of parts) ok(text.includes(p), `expected the text to mention ${JSON.stringify(p)}:\n${text}`);
}

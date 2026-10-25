// Checks on the text a run that decides prints.
import { ok } from "node:assert";

/** `text` holds each of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `missing ${JSON.stringify(part)} in:\n${text}`);
}

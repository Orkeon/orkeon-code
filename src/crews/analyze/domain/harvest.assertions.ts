// Checks on the texts the harvest module renders.
import { ok } from "node:assert";

/** `text` holds each of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `missing ${JSON.stringify(part)} in: ${text}`);
}

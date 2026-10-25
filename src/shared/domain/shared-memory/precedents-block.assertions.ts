// Checks on the "## Precedents" block.
import { ok } from "node:assert";

/** `text` holds each of `pieces`. */
export function assertMentions(text: string, pieces: readonly string[]): void {
  for (const piece of pieces) ok(text.includes(piece), `missing "${piece}" in:\n${text}`);
}

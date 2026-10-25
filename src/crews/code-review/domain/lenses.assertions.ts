// Checks on what the lens module describes.
import { ok } from "node:assert";

/** `text` holds every one of `needles`. */
export function assertMentions(text: string, needles: readonly string[]): void {
  for (const needle of needles) ok(text.includes(needle), `missing ${JSON.stringify(needle)} in:\n${text}`);
}

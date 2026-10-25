// Checks on the renders the harness reads.
import { ok } from "node:assert";

/** Every pattern of `patterns` matches `text`. */
export function assertMatchesAll(text: string, patterns: readonly RegExp[]): void {
  for (const re of patterns) ok(re.test(text), String(re));
}

/** `text` holds every part of `parts`, word for word. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `the render lacks ${JSON.stringify(part)}`);
}

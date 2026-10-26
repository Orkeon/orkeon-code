// Checks on the renders the harness reads.
import { ok } from "node:assert";

/** Every pattern of `patterns` matches `text`. */
export function assertMatchesAll(text: string, patterns: readonly RegExp[]): void {
  for (const re of patterns) ok(re.test(text), String(re));
}

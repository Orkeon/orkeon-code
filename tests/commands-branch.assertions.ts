// Checks on the texts /branch answers.
import { ok } from "node:assert";

/** `text` names every fragment of `fragments`. */
export function assertMentions(text: string, fragments: readonly string[]): void {
  for (const fragment of fragments) ok(text.includes(fragment), `"${fragment}" is missing from: ${text}`);
}

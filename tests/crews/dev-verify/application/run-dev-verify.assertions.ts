// Checks on the texts runDevVerify returned, wrote and sent to the auditor.
import { ok } from "node:assert";

/** `text` holds `first`, and `second` after it. */
export function assertBefore(text: string, first: string, second: string): void {
  const at = text.indexOf(first);
  ok(at >= 0, `the text lacks ${JSON.stringify(first)}:\n${text}`);
  ok(at < text.indexOf(second), `${JSON.stringify(first)} does not come before ${JSON.stringify(second)}:\n${text}`);
}

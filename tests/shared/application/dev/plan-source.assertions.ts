// Checks on what resolvePlanSource returns.
import { fail, strictEqual } from "node:assert";

/** `resolution` is a refusal whose text is `text`. */
export function assertRefused(resolution: { ok: true } | { ok: false; text: string }, text: string): void {
  if (resolution.ok) fail(`resolved where the refusal "${text}" was expected`);
  strictEqual(resolution.text, text, "not the refusal expected");
}

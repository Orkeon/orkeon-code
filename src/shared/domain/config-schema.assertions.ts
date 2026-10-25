// Checks of the /config key space tests.
import { ok } from "node:assert";

/** `text` holds every one of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const p of parts) ok(text.includes(p), `expected the text to mention ${JSON.stringify(p)}:\n${text}`);
}

/** A key's consumer is named as the user meets it: a command or the host, never a source file. */
export function assertUserFacingConsumer(key: string, consumedBy: string): void {
  ok(/^(\/[a-z-]+|the orkeon-repl )/.test(consumedBy), `${key}: ${consumedBy}`);
  ok(!/\.ts\b|\b(crews|commands|shared)\//.test(consumedBy), `${key}: ${consumedBy}`);
}

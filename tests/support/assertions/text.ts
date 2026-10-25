// The checks on a text every family makes: what it mentions, what it leaves out, the order of two parts, a line's
// start. Shared by the assertions files beside the tests, which keep the checks of their own module.
import { ok } from "node:assert";

/** `text` holds every one of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `the text lacks ${JSON.stringify(part)}:\n${text}`);
}

/** `text` holds none of `parts`. */
export function assertOmits(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(!text.includes(part), `the text holds ${JSON.stringify(part)}:\n${text}`);
}

/** `first` comes before `second` in `text`, both present. */
export function assertBefore(text: string, first: string, second: string): void {
  const at = text.indexOf(first);
  ok(at >= 0, `the text lacks ${JSON.stringify(first)}:\n${text}`);
  ok(text.includes(second), `the text lacks ${JSON.stringify(second)}:\n${text}`);
  ok(at < text.indexOf(second), `${JSON.stringify(first)} does not come before ${JSON.stringify(second)}:\n${text}`);
}

/** One of `lines` starts with `prefix`. */
export function assertLineStarting(lines: readonly string[], prefix: string): void {
  ok(lines.some((l) => l.startsWith(prefix)), `no line starting with ${JSON.stringify(prefix)}:\n${lines.join("\n")}`);
}

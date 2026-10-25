// Checks on the texts prompt assembly builds: what they mention, what they lack, in which order.
import { ok } from "node:assert";

/** `text` holds each of `parts`; `what` says what the text is, for the message. */
export function assertMentions(text: string, parts: readonly string[], what = "the text"): void {
  for (const part of parts) ok(text.includes(part), `${what} is missing ${JSON.stringify(part)}: ${text}`);
}

/** `text` holds none of `parts`; `what` says what the text is, for the message. */
export function assertLacks(text: string, parts: readonly string[], what = "the text"): void {
  for (const part of parts) ok(!text.includes(part), `${what} should not hold ${JSON.stringify(part)}: ${text}`);
}

/** `text` holds each of `markers`, their first occurrences in that order. */
export function assertInOrder(text: string, markers: readonly string[]): void {
  const order = markers.map((marker) => text.indexOf(marker));
  ok(
    order.every((idx, i) => idx >= 0 && (i === 0 || idx > order[i - 1]!)),
    `bad order: ${markers.map((m, i) => `${m}@${order[i]}`).join(", ")}`,
  );
}

/** `block` is wrapped in a <system-reminder>. */
export function assertSystemReminder(block: string): void {
  ok(block.startsWith("<system-reminder>"), `the block does not open a <system-reminder>: ${block}`);
  ok(block.endsWith("</system-reminder>"), `the block does not close its <system-reminder>: ${block}`);
}

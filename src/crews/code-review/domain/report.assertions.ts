// Checks on a rendered review report.
import { ok } from "node:assert";

/** `text` holds every one of `needles`. */
export function assertMentions(text: string, needles: readonly string[]): void {
  for (const needle of needles) ok(text.includes(needle), `missing ${JSON.stringify(needle)} in:\n${text}`);
}

/** `first` appears in `text` before `second`. */
export function assertBefore(text: string, first: string, second: string): void {
  ok(text.indexOf(first) < text.indexOf(second), `${JSON.stringify(first)} is not before ${JSON.stringify(second)} in:\n${text}`);
}

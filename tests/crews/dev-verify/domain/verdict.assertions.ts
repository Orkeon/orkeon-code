// Checks on a rendered verdict section.
import { ok } from "node:assert";

/** `text` holds `part` as written. */
export function assertHolds(text: string, part: string): void {
  ok(text.includes(part), `the section does not hold ${JSON.stringify(part)}:\n${text}`);
}

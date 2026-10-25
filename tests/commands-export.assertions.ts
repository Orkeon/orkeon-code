// Checks on the markdown /export renders.
import { ok } from "node:assert";

/** `md` holds every one of `parts`. */
export function assertMentions(md: string, parts: readonly string[]): void {
  for (const part of parts) ok(md.includes(part), `the export does not mention ${JSON.stringify(part)}:\n${md}`);
}

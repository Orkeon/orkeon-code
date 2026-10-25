// Checks on the texts of the auditor's prompts.
import { ok } from "node:assert";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";

/** `text` holds each of `parts` as written. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `the text lacks ${JSON.stringify(part)}:\n${text}`);
}

/** `text` holds none of `parts`. */
export function assertOmits(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(!text.includes(part), `the text holds ${JSON.stringify(part)}:\n${text}`);
}

/** `text` fits within MAX_BRIEF_CHARS. */
export function assertWithinBrief(text: string): void {
  ok(text.length <= MAX_BRIEF_CHARS, `${text.length} characters, past MAX_BRIEF_CHARS (${MAX_BRIEF_CHARS})`);
}

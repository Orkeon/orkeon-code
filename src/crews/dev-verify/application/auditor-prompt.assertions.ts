// Checks on the texts of the auditor's prompts.
import { ok } from "node:assert";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";

/** `text` fits within MAX_BRIEF_CHARS. */
export function assertWithinBrief(text: string): void {
  ok(text.length <= MAX_BRIEF_CHARS, `${text.length} characters, past MAX_BRIEF_CHARS (${MAX_BRIEF_CHARS})`);
}

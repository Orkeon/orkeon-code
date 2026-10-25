// Checks on the planner's prompt.
import { ok } from "node:assert";

/** `text` holds every part of `parts`, word for word. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `the prompt lacks ${JSON.stringify(part)}`);
}

/** `text` holds no part of `parts`. */
export function assertOmits(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(!text.includes(part), `the prompt holds ${JSON.stringify(part)}`);
}

/** `text` matches none of the host's words. */
export function assertNoHostWord(text: string, vocabulary: readonly RegExp[]): void {
  for (const m of vocabulary) ok(!m.test(text), `matches ${m}`);
}

/** `text` holds one line per design rule id: its name, when it applies and what it records. */
export function assertDesignRuleLines(text: string, ids: readonly string[]): void {
  for (const id of ids) ok(new RegExp(`^${id} — .+\\. Applies when .+\\. Records .+\\.$`, "m").test(text), id);
}

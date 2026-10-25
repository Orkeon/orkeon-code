// Checks on the planner's prompt.
import { ok } from "node:assert";

/** `text` matches none of the host's words. */
export function assertNoHostWord(text: string, vocabulary: readonly RegExp[]): void {
  for (const m of vocabulary) ok(!m.test(text), `matches ${m}`);
}

/** `text` holds one line per design rule id: its name, when it applies and what it records. */
export function assertDesignRuleLines(text: string, ids: readonly string[]): void {
  for (const id of ids) ok(new RegExp(`^${id} — .+\\. Applies when .+\\. Records .+\\.$`, "m").test(text), id);
}

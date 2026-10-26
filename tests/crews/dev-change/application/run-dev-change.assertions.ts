// Checks on what runDevChange wrote and sent.
import { ok } from "node:assert";

/** At least one prompt, each ending with the precedents block `block`. */
export function assertEndWithPrecedents(prompts: readonly string[], block: string): void {
  ok(prompts.length >= 1, "no brief prompt");
  for (const p of prompts) ok(p.trimEnd().endsWith(block), p.slice(-300));
}

/** No prompt holds `part`. */
export function assertNoPromptMentions(prompts: readonly string[], part: string): void {
  for (const p of prompts) ok(!p.includes(part), `unexpected ${JSON.stringify(part)} in: ${p}`);
}

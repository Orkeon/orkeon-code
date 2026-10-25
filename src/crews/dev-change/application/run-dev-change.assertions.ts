// Checks on what runDevChange wrote and sent.
import { ok } from "node:assert";

/** `text` holds each of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const part of parts) ok(text.includes(part), `missing ${JSON.stringify(part)} in: ${text}`);
}

/** Every path is under `folder`. */
export function assertAllUnder(paths: readonly string[], folder: string): void {
  for (const path of paths) ok(path.startsWith(folder), `${path} is not under ${folder}`);
}

/** At least one prompt, each ending with the precedents block `block`. */
export function assertEndWithPrecedents(prompts: readonly string[], block: string): void {
  ok(prompts.length >= 1, "no brief prompt");
  for (const p of prompts) ok(p.trimEnd().endsWith(block), p.slice(-300));
}

/** No prompt holds `part`. */
export function assertNoPromptMentions(prompts: readonly string[], part: string): void {
  for (const p of prompts) ok(!p.includes(part), `unexpected ${JSON.stringify(part)} in: ${p}`);
}

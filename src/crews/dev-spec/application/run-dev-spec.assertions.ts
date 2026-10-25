// Checks on what runDevSpec wrote, sent and said.
import { ok } from "node:assert";

/** Every path is under `folder`. */
export function assertAllUnder(paths: readonly string[], folder: string): void {
  for (const path of paths) ok(path.startsWith(folder), `${path} is not under ${folder}`);
}

/** `lines` holds each of `expected` as a whole line. */
export function assertHasLines(lines: readonly string[], expected: readonly string[]): void {
  for (const line of expected) ok(lines.includes(line), `no line ${JSON.stringify(line)} in:\n${lines.join("\n")}`);
}

/** At least `min` prompts, each holding `part`. */
export function assertAllMention(prompts: readonly string[], part: string, min: number, why: string): void {
  ok(prompts.length >= min, why);
  for (const p of prompts) ok(p.includes(part), p.slice(-300));
}

/** No prompt holds `part`. */
export function assertNoPromptMentions(prompts: readonly string[], part: string): void {
  for (const p of prompts) ok(!p.includes(part), `unexpected ${JSON.stringify(part)} in: ${p}`);
}

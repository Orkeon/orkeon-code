// Checks on what runDevSpec wrote, sent and said.
import { ok, strictEqual } from "node:assert";

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

const FOLD_LINE = "Decisions of this run, to write into the body:";

/** Exactly one prompt of `prompts` is a fold, the last one, and it carries each of `decisions`. */
export function assertSingleFold(prompts: readonly string[], decisions: readonly string[]): void {
  const folds = prompts.filter((p) => p.includes(FOLD_LINE));
  strictEqual(folds.length, 1, `${folds.length} fold prompts among ${prompts.length}`);
  ok((prompts.at(-1) ?? "").includes(FOLD_LINE), "the fold is not the last model call");
  for (const d of decisions) ok(folds[0].includes(d), `the fold lacks the decision ${JSON.stringify(d)}`);
}

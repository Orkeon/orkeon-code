// Checks on what checkLearnAnswer finds and on its schema.
import { ok } from "node:assert";

/** `problems` holds `problem`. */
export function assertProblem(problems: readonly string[], problem: string): void {
  ok(problems.includes(problem), `${JSON.stringify(problem)} not among ${JSON.stringify(problems)}`);
}

/** `text` holds each word of `words` between double quotes. */
export function assertQuotesWords(text: string, words: readonly string[]): void {
  for (const word of words) ok(text.includes(`"${word}"`), `"${word}" missing from ${text}`);
}

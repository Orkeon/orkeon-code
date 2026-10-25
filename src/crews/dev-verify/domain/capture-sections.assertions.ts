// Checks on the files splitSection cuts a section into.
import { ok, strictEqual } from "node:assert";
import { MAX_SECTION_CHARS } from "./capture-sections.ts";
import type { SectionFile } from "./capture-sections.ts";

/** No part is longer than MAX_SECTION_CHARS. */
export function assertPartsWithinMax(files: readonly SectionFile[]): void {
  for (const f of files) ok(f.content.length <= MAX_SECTION_CHARS, `${f.name} is ${f.content.length}`);
}

/**
 * The first of two parts holds 31 000 characters cut on a line break, then the continuation line naming the second;
 * the two parts together give `content` back.
 */
export function assertContinuedOnLineBreak(files: readonly SectionFile[], content: string): void {
  const next = files[1].name;
  const continuation = `\n[continued in ${next}]\n`;
  ok(files[0].content.endsWith(`\n${continuation}`), `${files[0].name} does not end with the line continuing in ${next}`);
  const first = files[0].content.slice(0, -continuation.length);
  strictEqual(first.length, 31_000, `${files[0].name} keeps ${first.length} characters, not 31 000`);
  ok(first.endsWith("\n"), `${files[0].name} is not cut on a line break`);
  strictEqual(first + files[1].content, content, "the two parts do not give the content back");
}

// Checks on the learner's prompt.
import { ok } from "node:assert";

import { MAX_LEARN_PROMPT_CHARS } from "../../../../src/crews/dev-learn/application/learn-prompt.ts";
import type { OwnerLinesBlock } from "../../../../src/crews/dev-learn/domain/owner-lines.ts";

/** The prompt fits MAX_LEARN_PROMPT_CHARS and shows the owner lines whole. */
export function assertOwnerLinesShown(prompt: string, blockText: string): void {
  ok(prompt.length <= MAX_LEARN_PROMPT_CHARS, `${prompt.length} characters, over ${MAX_LEARN_PROMPT_CHARS}`);
  ok(prompt.includes(blockText), "the owner lines are cut");
}

/** The prompt fits MAX_LEARN_PROMPT_CHARS, keeps every problem and the first owner line, and cut the last one. */
export function assertOwnerLinesCutFirst(prompt: string, problems: readonly string[], block: OwnerLinesBlock): void {
  ok(prompt.length <= MAX_LEARN_PROMPT_CHARS, `${prompt.length} characters, over ${MAX_LEARN_PROMPT_CHARS}`);
  for (const p of problems) ok(prompt.includes(`- ${p}`), `the problem ${JSON.stringify(p)} is cut`);
  ok(prompt.includes(`${block.lines[0]}\n`), "the first owner line is cut");
  ok(!prompt.includes(block.lines[block.lines.length - 1]), "the last owner line is kept");
}

/** The prompt fits MAX_LEARN_PROMPT_CHARS and keeps every problem. */
export function assertProblemsKept(prompt: string, problems: readonly string[]): void {
  ok(prompt.length <= MAX_LEARN_PROMPT_CHARS, `${prompt.length} characters, over ${MAX_LEARN_PROMPT_CHARS}`);
  for (const p of problems) ok(prompt.includes(`- ${p}`), `the problem ${JSON.stringify(p.slice(0, 40))} is cut`);
}

/** The prompt fits MAX_LEARN_PROMPT_CHARS and shows every line of every block. */
export function assertEveryOwnerLineShown(prompt: string, blocks: readonly OwnerLinesBlock[]): void {
  ok(prompt.length <= MAX_LEARN_PROMPT_CHARS, `${prompt.length} characters, over ${MAX_LEARN_PROMPT_CHARS}`);
  const cut = blocks.flatMap((b) => b.lines.filter((l) => !prompt.includes(`${l}\n`) && !prompt.endsWith(l)));
  ok(cut.length === 0, `${cut.length} owner lines cut`);
}

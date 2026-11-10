// The material the learner's prompt is assembled from in the learn-prompt-fit tests.
import type { LearnRow } from "../../../../src/shared/domain/shared-memory/verdict-rows.ts";
import type { LearnPromptInput } from "../../../../src/crews/dev-learn/application/learn-prompt-fit.ts";
import { MAX_MOTIFS_PER_AXIS, motifLabel } from "../../../../src/crews/dev-learn/domain/learn-answer.ts";
import { MAX_OWNER_LINE_CHARS, MAX_OWNER_LINES_PER_MOTIF } from "../../../../src/crews/dev-learn/domain/owner-lines.ts";
import type { OwnerLinesBlock } from "../../../../src/crews/dev-learn/domain/owner-lines.ts";

/** A Major Test row of `batch`, its fields overridden by `over`. */
export const row = (id: string, batch: string, over: Partial<LearnRow> = {}): LearnRow => ({
  id, batch, severity: "Major", axis: "Test", gap: `the refusal of ${batch} has no test`,
  evidence: "src/ledger/withdraw.ts:14", fix: "add the case", source: `${batch}.md`, line: 7, ...over,
});

export const INPUT: LearnPromptInput = {
  axis: "Test",
  rows: [row("c936075d95", "ledger/F1"), row("b983faad38", "ledger/F3"), row("3a59a45e69", "invoices/F2")],
  refused: ["rounding-inside-handlers — Rounding inside handlers", "keep: Each command returns a CommandView."],
  owners: ["CONTRIBUTING.md", "tests/architecture.test.ts"],
};

/** The problems a re-ask carries. */
export const PROBLEMS: readonly string[] = ["motif 1: row 'abc' is not one of the rows given", "motif 2: key_term is empty"];

/** A row whose gap, evidence and fix run past their cuts, its fix holding a pipe and a line break. */
export const LONG_ROW: LearnRow = row("c936075d95", "ledger/F1", {
  gap: `${"g".repeat(250)}`, evidence: "e".repeat(100), fix: "open|done\nnext " + "f".repeat(200),
});

/** How the problems name the motif the owner lines are shown for. */
const LABEL = motifLabel(1, "Refusal paths go untested");

/** The owner lines of one motif, as the re-ask shows them. */
export const BLOCK: OwnerLinesBlock = {
  label: LABEL, path: "CONTRIBUTING.md",
  lines: ["CONTRIBUTING.md:3: A refusal is part of a command's contract.", "CONTRIBUTING.md:9: Each refusal has a test."],
};

/** What the re-ask renders of BLOCK under its problems. */
export const BLOCK_TEXT = `\nOwner lines found for ${LABEL} (CONTRIBUTING.md):\n` +
  "CONTRIBUTING.md:3: A refusal is part of a command's contract.\nCONTRIBUTING.md:9: Each refusal has a test.";

/** Owner lines far past the prompt's budget: 400 lines of about 170 characters. */
export const HUGE_BLOCK: OwnerLinesBlock = {
  label: LABEL, path: "CONTRIBUTING.md",
  lines: Array.from({ length: 400 }, (_, i) => `CONTRIBUTING.md:${i + 1}: ${"r".repeat(150)}`),
};

/** An axis whose forty rows, every cell at its cut, fill the prompt's budget on their own. */
export const FULL_INPUT: LearnPromptInput = {
  ...INPUT,
  rows: Array.from({ length: 40 }, (_, i) => ({ ...LONG_ROW, id: `row${String(i).padStart(6, "0")}`, batch: `b/${"F".repeat(70)}${i}` })),
};

/** Fifteen problems of about 250 characters: three motifs of five removed lines the owner lacks. */
export const MANY_PROBLEMS: readonly string[] = Array.from({ length: 15 }, (_, i) =>
  `motif ${1 + (i % 3)}: removed line not found in CONTRIBUTING.md: "${"x".repeat(60)}"; nearest: CONTRIBUTING.md:${i}: ${"y".repeat(150)}`);

/** The longest harness destination the learner is shown. */
const LONGEST_DESTINATION = ".devcontainer/harness/packs/dev/claude/skills/dev-implement/references/common-rules.md";

/** The most owner lines a re-ask can show: every motif's block full, each line at its cut under the longest
 *  harness destination, with a five-digit line number, each label quoting a cut title. */
export const WORST_BLOCKS: readonly OwnerLinesBlock[] = Array.from({ length: MAX_MOTIFS_PER_AXIS }, (_, k) => ({
  label: motifLabel(k + 1, "t".repeat(70)), path: LONGEST_DESTINATION,
  lines: Array.from({ length: MAX_OWNER_LINES_PER_MOTIF }, (_, i) =>
    `${LONGEST_DESTINATION}:${10_000 + i}: ${"r".repeat(MAX_OWNER_LINE_CHARS)}`),
}));

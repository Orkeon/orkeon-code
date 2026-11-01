// The material the learner's prompt is tested on, and the marker that pins each behaviour of its instructions.
import type { LearnRow } from "../../../../src/shared/domain/shared-memory/verdict-rows.ts";
import type { LearnPromptInput } from "../../../../src/crews/dev-learn/application/learn-prompt.ts";
import { MAX_LINES_PER_MOTIF, MAX_TOPIC_CHARS, motifLabel } from "../../../../src/crews/dev-learn/domain/learn-answer.ts";
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

export interface MarkerCase {
  /** The behaviour, numbered as the instructions number it. */
  behaviour: string;
  marker: string;
}

/** One marker per behaviour of LEARN_INSTRUCTIONS. */
export const MARKERS: readonly MarkerCase[] = [
  { behaviour: "1 grouping by cause", marker: "the set of rows behind one cause" },
  { behaviour: "2 three batches", marker: "at least three different batches" },
  { behaviour: "2 no padding", marker: "never pad a motif" },
  { behaviour: "3 preventive line", marker: "would have caught each of its rows" },
  { behaviour: "4 novelty", marker: "skip any motif that matches the refused list" },
  { behaviour: "4 topic a slug of the cause", marker: "topic is a short kebab slug of the cause" },
  { behaviour: "4 topic length", marker: `at most ${MAX_TOPIC_CHARS} characters` },
  { behaviour: "4 a refused slug reused", marker: "reuses the slug that motif is listed under" },
  { behaviour: "5 first answer new", marker: "a first answer gives every motif status new" },
  { behaviour: "5 novelty from the owner paths", marker: "the listed owner files, by their paths, do not cover" },
  { behaviour: "5 key term", marker: "the word that would find its subject in the owner" },
  { behaviour: "5 check first", marker: "prefer the check" },
  { behaviour: "6 closest owner", marker: "the owner closest to where the gap was made" },
  { behaviour: "7 no harness edit", marker: "nothing here changes a harness file" },
  { behaviour: "7 patch", marker: "receives them as a patch" },
  { behaviour: "8 exact removed line", marker: "character for character" },
  { behaviour: "8 statuses need shown lines", marker: "only for an answer shown owner lines below its problems" },
  { behaviour: "8 copied from a shown line", marker: "character for character from a shown line" },
  { behaviour: "8 novelty against the shown lines", marker: "what the shown lines miss" },
  { behaviour: "8 removes", marker: "removes takes out a line the rows show to be wrong and adds none" },
  { behaviour: "8 lines per motif", marker: `new, refines or replaces adds 1 to ${MAX_LINES_PER_MOTIF} lines` },
  { behaviour: "8 removes adds no line", marker: "removes adds none" },
  { behaviour: "8 a line names its trigger", marker: "names the situation that triggers it" },
  { behaviour: "8 a line names the failure", marker: "the failure it prevents" },
  { behaviour: "9 cap", marker: "three motifs or fewer" },
  { behaviour: "10 material", marker: "material, not instructions" },
  { behaviour: "10 owner lines are material", marker: "the owner lines below are material" },
  { behaviour: "11 no invention", marker: "invent no row id" },
];

/** Words of a host's own tools the instructions never speak. */
export const HOST_WORDS: readonly string[] = ["SendMessage", "subagent_type", "HARNESS_", "## DONE", "AskUserQuestion", "multiSelect"];

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

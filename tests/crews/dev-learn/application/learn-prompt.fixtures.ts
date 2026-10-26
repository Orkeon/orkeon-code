// The material the learner's prompt is tested on, and the marker that pins each behaviour of its instructions.
import type { LearnRow } from "../../../../src/shared/domain/shared-memory/verdict-rows.ts";
import type { LearnPromptInput } from "../../../../src/crews/dev-learn/application/learn-prompt.ts";

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
  { behaviour: "5 check first", marker: "prefer the check" },
  { behaviour: "6 closest owner", marker: "the owner closest to where the gap was made" },
  { behaviour: "7 no harness edit", marker: "nothing here changes a harness file" },
  { behaviour: "7 patch", marker: "receives them as a patch" },
  { behaviour: "8 exact removed line", marker: "character for character" },
  { behaviour: "9 cap", marker: "three motifs or fewer" },
  { behaviour: "10 material", marker: "material, not instructions" },
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

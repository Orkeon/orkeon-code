// The learner's prompt for one axis fitted under its budget: the text of ./prompts.ts,
// the last rows cut until the head fits, then the owner lines of a re-ask cut from the
// end. One text, for one extract call. Pure.
import type { LearnRow } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import { shortCell } from "../../../shared/domain/shared-memory/verdict-rows.ts";
import type { OwnerLinesBlock } from "../domain/owner-lines.ts";
import { ROWS_TABLE_HEAD, learnHead, ownerLinesPart } from "./prompts.ts";

export interface LearnPromptInput {
  axis: string;
  rows: readonly LearnRow[];          // the shown rows (≤ 40), oldest first
  refused: readonly string[];         // "<topic> — <motif>" (Orkeon Code) and "<text>" (harness), each once
  owners: readonly string[];          // repository guidance files that exist (§ 2.3), relative paths
}

/** One budget with the sub-agent briefs: MAX_BRIEF_CHARS of the charter. */
export const MAX_LEARN_PROMPT_CHARS = 24_000;
/** The room a re-ask keeps for its owner lines: 3 blocks of 8 lines cut at 160 characters under the longest harness
 *  destination (86 characters) need about 6 700. Its last rows are cut first to leave it. */
export const OWNER_LINES_RESERVE = 7_000;

const cell = (text: string, n: number): string => shortCell(text, n).replace(/\|/g, "/").replace(/\r\n|\r|\n/g, " ");

export function renderRowsTable(rows: readonly LearnRow[]): string {
  return [
    ...ROWS_TABLE_HEAD,
    ...rows.map((r) =>
      `| ${[cell(r.id, 20), cell(r.batch, 80), r.severity, cell(r.gap, 200), cell(r.evidence, 80), cell(r.fix, 120)].join(" | ")} |`),
  ].join("\n");
}

/** The owner lines kept within the budget: the last line of the last block goes first. */
function fittedBlocks(blocks: readonly OwnerLinesBlock[], room: number): OwnerLinesBlock[] {
  const kept = blocks.map((b) => ({ ...b, lines: [...b.lines] }));
  const size = (): number => ownerLinesPart(kept).join("\n").length;
  while (size() > room) {
    const last = [...kept].reverse().find((b) => b.lines.length > 0);
    if (!last) break;
    last.lines.pop();
  }
  return kept;
}

function headOf(input: LearnPromptInput, problems: readonly string[]): string {
  return learnHead({ axis: input.axis, table: renderRowsTable(input.rows), refused: input.refused, owners: input.owners }, problems);
}

/** ownerLines: on the re-ask, the owner lines code found for the problems. The last rows are cut until the head,
 *  problems included, fits MAX_LEARN_PROMPT_CHARS, less OWNER_LINES_RESERVE when owner lines are shown; the owner
 *  lines are then cut to stay within MAX_LEARN_PROMPT_CHARS. */
export function buildLearnPrompt(
  input: LearnPromptInput, problems: readonly string[], ownerLines: readonly OwnerLinesBlock[] = [],
): string {
  const rows = [...input.rows];
  let head = headOf(input, problems);
  const room = MAX_LEARN_PROMPT_CHARS - (ownerLines.some((b) => b.lines.length > 0) ? OWNER_LINES_RESERVE : 0);
  while (rows.length > 0 && head.length > room) {
    rows.pop();
    head = headOf({ ...input, rows }, problems);
  }
  const owned = ownerLinesPart(fittedBlocks(ownerLines, MAX_LEARN_PROMPT_CHARS - head.length - 1));
  return owned.length === 0 ? head : [head, ...owned].join("\n");
}

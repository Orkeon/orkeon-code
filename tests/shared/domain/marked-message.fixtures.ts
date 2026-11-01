// The stored messages a marker opens, and the typed ones that only open with a bracket.
import { COMPACTED_HEADER } from "../../../src/shared/domain/compaction.ts";

export const MARKED_CASES: { name: string; content: string; marked: boolean }[] = [
  { name: "marks a turn's context message", content: "[turn-context] Context the turn-start checks added:\nsession resumed", marked: true },
  { name: "marks the summary of compacted turns", content: `${COMPACTED_HEADER}\nthe work so far`, marked: true },
  { name: "marks a turn's tool trace", content: "[tools] The tool calls of the answer below:\n- grep(path=src)", marked: true },
  { name: "leaves a typed request that opens with a bracket unmarked", content: "[bug] why does the parser fail?", marked: false },
  { name: "leaves a plain request unmarked", content: "how many sealed classes?", marked: false },
];

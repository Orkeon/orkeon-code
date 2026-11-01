// The messages the harness stores in the session with a marker opening them: a turn's context lines, the summary of
// compacted turns, a turn's tool trace. They are material, never a request the user typed, even one that opens with
// a bracket ("[bug] why does it fail?").
import { COMPACTED_HEADER } from "./compaction.ts";
import { TOOL_TRACE_MARKER } from "./tool-trace.ts";

/** The marker of the stored message holding a turn's context lines; the header names it as material. */
export const TURN_CONTEXT_MARKER = "[turn-context]";

/** The marker that opens the summary of compacted turns. */
export const COMPACTED_MARKER = COMPACTED_HEADER.slice(0, COMPACTED_HEADER.indexOf("]") + 1);

const MARKERS: readonly string[] = [TURN_CONTEXT_MARKER, COMPACTED_MARKER, TOOL_TRACE_MARKER];

/** Whether a stored message opens with one of the harness's markers. */
export function isMarkedMessage(content: string): boolean {
  return MARKERS.some((m) => content.startsWith(m));
}

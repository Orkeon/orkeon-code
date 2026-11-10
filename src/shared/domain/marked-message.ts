// The messages the harness stores in the session with a marker opening them: a turn's context lines, the summary of
// compacted turns, a turn's tool trace. They are material, never a request the user typed, even one that opens with
// a bracket ("[bug] why does it fail?").
import { COMPACTED_HEADER, TOOL_TRACE_MARKER, TURN_CONTEXT_MARKER } from "./markers.ts";
import type { SessionMsg } from "./types.ts";

/** The marker that opens the summary of compacted turns. */
export const COMPACTED_MARKER = COMPACTED_HEADER.slice(0, COMPACTED_HEADER.indexOf("]") + 1);

const MARKERS: readonly string[] = [TURN_CONTEXT_MARKER, COMPACTED_MARKER, TOOL_TRACE_MARKER];

/** Whether a stored message opens with one of the harness's markers. */
export function isMarkedMessage(content: string): boolean {
  return MARKERS.some((m) => content.startsWith(m));
}

/** How many messages at the end of `messages` are the request still waiting for its answer: the last one when the
 *  user typed it (a user message no marker opens), with the [turn-context] stored just before it; none when the buffer
 *  ends on an answer or on a message of the harness. The first message, the head of the buffer, is never counted. */
export function pendingRequestLength(messages: readonly SessionMsg[]): number {
  const last = messages.length - 1;
  if (last < 1 || !isTypedRequest(messages[last])) return 0;
  const before = messages[last - 1];
  return last >= 2 && before.role === "user" && String(before.content).startsWith(TURN_CONTEXT_MARKER) ? 2 : 1;
}

function isTypedRequest(message: SessionMsg): boolean {
  return message.role === "user" && !isMarkedMessage(String(message.content));
}

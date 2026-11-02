// Buffers whose last turns runtimeTurnsToKeep counts as session_snip does.
import type { SessionMsg } from "../../../src/shared/domain/types.ts";
import { TURN_CONTEXT_MARKER } from "../../../src/shared/domain/marked-message.ts";
import { TOOL_TRACE_MARKER } from "../../../src/shared/domain/tool-trace.ts";

const head: SessionMsg = { role: "user", content: "first request" };
const context: SessionMsg = { role: "user", content: `${TURN_CONTEXT_MARKER} Context the turn-start checks added:\nsession resumed` };
const request = (text: string): SessionMsg => ({ role: "user", content: text });
const trace: SessionMsg = { role: "system", content: `${TOOL_TRACE_MARKER} The tool calls of the answer below:\n- edit_file` };
const answer: SessionMsg = { role: "assistant", content: "done" };

export interface KeepCase {
  name: string;
  messages: SessionMsg[];
  turns: number;
  keep: number | null;
}

export const KEEP_CASES: readonly KeepCase[] = [
  {
    name: "keeps one of the runtime's turns per turn without context lines",
    messages: [head, request("a"), trace, answer, request("b"), answer, request("c"), answer],
    turns: 2,
    keep: 2,
  },
  {
    name: "counts the [turn-context] of the first kept turn, so the cut does not split it from its request",
    messages: [head, request("a"), answer, context, request("b"), trace, answer, request("c"), answer],
    turns: 2,
    keep: 3,
  },
  {
    name: "counts the request still waiting for its answer as the last turn",
    messages: [head, request("a"), answer, request("b"), answer, context, request("c")],
    turns: 1,
    keep: 2,
  },
  {
    name: "counts a marked user message inside the kept turns without taking it for a request",
    messages: [head, request("a"), answer, request("b"), answer, context, request("c"), answer],
    turns: 2,
    keep: 3,
  },
  {
    name: "finds nothing to cut when the buffer holds fewer turns than asked",
    messages: [head, request("a"), answer, request("b"), answer],
    turns: 3,
    keep: null,
  },
  {
    name: "never counts the head as a turn",
    messages: [head, request("a"), answer],
    turns: 2,
    keep: null,
  },
  {
    name: "keeps the head alone when no turn is asked",
    messages: [head, request("a"), answer],
    turns: 0,
    keep: 0,
  },
];

export interface TailCase {
  name: string;
  messages: SessionMsg[];
  runtimeTurns: number;
  tail: number | null;
}

export const TAIL_CASES: readonly TailCase[] = [
  {
    name: "counts the messages from the first kept user message to the end, its traces and answers included",
    messages: [head, request("a"), trace, answer, request("b"), trace, answer, request("c"), answer],
    runtimeTurns: 2,
    tail: 5,
  },
  {
    name: "counts a [turn-context] as the user message that opens one of the runtime's turns",
    messages: [head, request("a"), answer, context, request("b"), trace, answer],
    runtimeTurns: 2,
    tail: 4,
  },
  {
    name: "finds no tail when the buffer holds fewer of the runtime's turns than asked after its head",
    messages: [head, request("a"), answer],
    runtimeTurns: 2,
    tail: null,
  },
  {
    name: "keeps no message when no turn is asked",
    messages: [head, request("a"), answer],
    runtimeTurns: 0,
    tail: 0,
  },
];

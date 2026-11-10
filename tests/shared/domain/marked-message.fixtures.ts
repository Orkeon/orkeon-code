// The stored messages a marker opens, and the typed ones that only open with a bracket.
import { buildSnipNoticeMessage } from "../../../src/shared/domain/compaction.ts";
import { COMPACTED_HEADER } from "../../../src/shared/domain/markers.ts";
import type { SessionMsg } from "../../../src/shared/domain/types.ts";

export const MARKED_CASES: { name: string; content: string; marked: boolean }[] = [
  { name: "marks a turn's context message", content: "[turn-context] Context the turn-start checks added:\nsession resumed", marked: true },
  { name: "marks the summary of compacted turns", content: `${COMPACTED_HEADER}\nthe work so far`, marked: true },
  { name: "marks a turn's tool trace", content: "[tools] The tool calls of the answer below:\n- grep(path=src)", marked: true },
  { name: "leaves a typed request that opens with a bracket unmarked", content: "[bug] why does the parser fail?", marked: false },
  { name: "leaves a plain request unmarked", content: "how many sealed classes?", marked: false },
];

const HEAD: SessionMsg = { role: "system", content: "head" };
const CONTEXT: SessionMsg = { role: "user", content: "[turn-context] Context the turn-start checks added:\nsession resumed" };
const REQUEST: SessionMsg = { role: "user", content: "now add a test" };
const ANSWER: SessionMsg = { role: "assistant", content: "done" };

/** Buffers and how many messages at their end are the request still waiting for its answer. */
export const PENDING_CASES: { name: string; messages: SessionMsg[]; length: number }[] = [
  { name: "counts the request and its turn context at the end of the buffer", messages: [HEAD, ANSWER, CONTEXT, REQUEST], length: 2 },
  { name: "counts a request stored without a turn context", messages: [HEAD, ANSWER, REQUEST], length: 1 },
  { name: "counts nothing when the buffer ends on an answer", messages: [HEAD, REQUEST, ANSWER], length: 0 },
  { name: "counts nothing when the buffer ends on a message of the harness", messages: [HEAD, REQUEST, buildSnipNoticeMessage()], length: 0 },
  { name: "counts nothing when the buffer ends on a marked user message", messages: [HEAD, ANSWER, CONTEXT], length: 0 },
  { name: "never counts the head of the buffer", messages: [REQUEST], length: 0 },
  { name: "never counts the head as the turn context of the request", messages: [CONTEXT, REQUEST], length: 1 },
];

// The markers of shared/domain: the values a writer and a reader share (ADR 0026).

// ── Compaction ──────────────────────────────────────────────────────────

/** The markers the summary is written between; the host keeps only what they enclose. */
export const SUMMARY_OPEN = "<summary>";
export const SUMMARY_CLOSE = "</summary>";

/** Content marker of the compaction boundary — survives stores that round-trip
 *  only role/content, so detection never depends on `subtype`. The model never
 *  reads it: the history block leaves boundaries out. */
export const COMPACT_BOUNDARY_MARKER = "[compact-boundary]";

/** The first line of the summary message: what it is, so its "still to do" part
 *  does not read as a fresh request. */
export const COMPACTED_HEADER = "[compacted] Summary of the earlier turns, written when they were compacted: a record of the work, not a new request.";

// ── Marked messages ─────────────────────────────────────────────────────

/** The marker of the stored message holding a turn's context lines; the header names it as material. */
export const TURN_CONTEXT_MARKER = "[turn-context]";

/** The marker of a turn's tool trace; the header names it as material. */
export const TOOL_TRACE_MARKER = "[tools]";

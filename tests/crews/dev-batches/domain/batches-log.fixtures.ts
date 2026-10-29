// Moments, lines and logs for the batches log tests.
import { closedLine, eventLine } from "../../../../src/crews/dev-batches/domain/batches-log.ts";
import type { BatchEvent } from "../../../../src/crews/dev-batches/domain/batches-log.ts";

/** The moment every line is stamped with: 2026-10-24 07:05 UTC. */
export const AT = new Date(Date.UTC(2026, 9, 24, 7, 5));

/** Event lines eventLine writes at AT, each named by its behaviour. */
export const EVENT_LINES: readonly { name: string; batch: string; event: BatchEvent; detail?: string; expected: string }[] = [
  { name: "writes an event without a detail as its stamp, batch and event", batch: "F2", event: "launched",
    expected: "- 2026-10-24 07:05 F2 launched" },
  { name: "keeps a detail on one line", batch: "F2", event: "stopped", detail: "BLOCKED —\n two\tlines",
    expected: "- 2026-10-24 07:05 F2 stopped BLOCKED — two lines" },
];

/** F1 launched, returned VALID, merged, then the run closed. */
export const F1_MERGED_LINES: readonly string[] = [
  eventLine(AT, "F1", "launched"), eventLine(AT, "F1", "returned", "VALID"), eventLine(AT, "F1", "merged", "abc1234"),
  closedLine(AT),
];

/** A log whose last line has no newline after it. */
export const LOG_WITHOUT_FINAL_NEWLINE = "# DEMO-BATCHES-STATE\n\n## Log\n\n- 2026-10-24 07:05 F1 launched";

/** The logs whose batch F2 still owes its review before its launch, or not, each named by its behaviour. */
export const REVIEW_PENDING: readonly { name: string; lines: readonly string[]; expected: boolean }[] = [
  { name: "owes the review of a batch the log does not hold yet", lines: F1_MERGED_LINES.slice(0, 3), expected: true },
  { name: "owes the review again of a batch stopped because its review did not run",
    lines: [eventLine(AT, "F2", "stopped", "BLOCKED — review not run (no reviewer on this host)")], expected: true },
  { name: "owes no review of a batch stopped for Blocking questions: the human settled them",
    lines: [eventLine(AT, "F2", "stopped", "BLOCKED — review: 1 Blocking")], expected: false },
  { name: "owes no review of a batch launched once", lines: [eventLine(AT, "F2", "launched", "audits 0")], expected: false },
];

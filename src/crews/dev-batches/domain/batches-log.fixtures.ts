// Moments, lines and logs for the batches log tests.
import { closedLine, eventLine } from "./batches-log.ts";
import type { BatchEvent } from "./batches-log.ts";

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

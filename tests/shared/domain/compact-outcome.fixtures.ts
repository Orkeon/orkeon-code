// Outcomes of a compaction and the line formatOutcome makes of each.
import type { CompactOutcome } from "../../../src/shared/domain/compact-outcome.ts";

export interface OutcomeCase {
  readonly name: string;
  readonly outcome: CompactOutcome;
  readonly line: string;
}

export const OUTCOME_CASES: readonly OutcomeCase[] = [
  {
    name: "reports a compaction with the message counts and the usage it started from",
    outcome: { status: "compacted", before: 40, after: 6, usedTokens: 170000 },
    line: "✓ compacted 40 → 6 messages (was ~170000 tokens)",
  },
  {
    name: "reports a compaction with the message counts alone when no usage is known",
    outcome: { status: "compacted", before: 40, after: 6 },
    line: "✓ compacted 40 → 6 messages",
  },
  {
    name: "tells a buffer too small",
    outcome: { status: "skipped", reason: "buffer too small" },
    line: "Buffer too small to compact.",
  },
  {
    name: "tells another skip by its reason",
    outcome: { status: "skipped", reason: "below trigger" },
    line: "Compaction skipped (below trigger).",
  },
  {
    name: "carries the reason of a failure",
    outcome: { status: "failed", reason: "model down" },
    line: "Compaction failed: model down",
  },
  {
    name: "says the buffer was snipped without a summary when the failure fell back to the snip",
    outcome: { status: "failed", reason: "model down", fallback: "snip" },
    line: "Compaction failed: model down\nThe buffer was snipped instead: the earlier turns were removed without a summary.",
  },
  {
    name: "adds the state file of the batch in progress on a line of its own",
    outcome: { status: "compacted", before: 40, after: 6, state: { path: ".orkeon/dev/demo/state-F2.md" } },
    line: "✓ compacted 40 → 6 messages\nstate of the batch in progress: .orkeon/dev/demo/state-F2.md",
  },
  {
    name: "adds why no state file was written on a line of its own",
    outcome: { status: "skipped", reason: "buffer too small", state: { skipped: "F1 is done" } },
    line: "Buffer too small to compact.\nno state file written: F1 is done",
  },
];

// The compaction outcome line. Run:
//   node --test src/shared/domain/compact-outcome.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { formatOutcome } from "./compact-outcome.ts";

describe("formatOutcome", () => {
  it("reports a compaction with the message counts and the usage it started from", () => {
    strictEqual(formatOutcome({ status: "compacted", before: 40, after: 6, usedTokens: 170000 }),
      "✓ compacted 40 → 6 messages (was ~170000 tokens)");
    strictEqual(formatOutcome({ status: "compacted", before: 40, after: 6 }), "✓ compacted 40 → 6 messages");
  });

  it("reports a snip with the usage it left", () => {
    strictEqual(formatOutcome({ status: "snipped", before: 40, usedTokens: 900 }),
      "✓ micro-compacted (snip) — 40 messages trimmed, now ~900 tokens");
    strictEqual(formatOutcome({ status: "snipped", before: 40, after: 0 }), "✓ micro-compacted (snip) — 40 messages trimmed");
  });

  it("tells a buffer too small from another skip", () => {
    strictEqual(formatOutcome({ status: "skipped", reason: "buffer too small" }), "Buffer too small to compact.");
    strictEqual(formatOutcome({ status: "skipped", reason: "below trigger" }), "Compaction skipped (below trigger).");
  });

  it("carries the reason of a failure", () => {
    strictEqual(formatOutcome({ status: "failed", reason: "model down" }), "Compaction failed: model down");
  });

  it("adds the state file of the batch in progress, or why none was written, on a line of its own", () => {
    strictEqual(formatOutcome({ status: "compacted", before: 40, after: 6, state: { path: ".orkeon/dev/demo/state-F2.md" } }),
      "✓ compacted 40 → 6 messages\nstate of the batch in progress: .orkeon/dev/demo/state-F2.md");
    strictEqual(formatOutcome({ status: "skipped", reason: "buffer too small", state: { skipped: "F1 is done" } }),
      "Buffer too small to compact.\nno state file written: F1 is done");
  });
});

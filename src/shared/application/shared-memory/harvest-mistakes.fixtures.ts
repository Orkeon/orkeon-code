// The memory, the clock and the audit rows harvestMistakes is tested on.
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import type { LearnRow } from "../../domain/shared-memory/verdict-rows.ts";
import { FakeClock } from "../../../../tests/support/doubles/fake-clock.ts";

export const layout = memoryLayout(".orkeon/memory");
export const memory = { layout, project: "shop" };
export const clock = new FakeClock().now;
export const TOPIC_GAP = "Empty cart untested";

/** One Blocking tests row of the F1 verdict of `code`. */
export const row = (code: string, gap: string): LearnRow => ({
  id: "0123456789", batch: `${code}/F1`, severity: "Blocking", axis: "tests", gap, evidence: "src/a.ts:3", fix: "test it",
  source: `${code}/${code.toUpperCase()}-VERIFY-F1.md`, line: 4,
});

/** The same gap in three batches: enough to harvest. */
export const rows = (gap: string) => ["a", "b", "c"].map((code) => row(code, gap));

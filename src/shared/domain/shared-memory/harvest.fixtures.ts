// The audit rows and the context mistakeCandidates is tested on.
import type { LearnRow } from "./verdict-rows.ts";

/** An audit row of `batch` (`<code>/<batch>`) naming `gap`, its other fields defaulted. */
export const row = (batch: string, gap: string, over: Partial<LearnRow> = {}): LearnRow => ({
  id: "0123456789", batch, severity: "Major", axis: "tests", gap, evidence: "src/a.ts:3", fix: "assert the edge case",
  source: `${batch.split("/")[0]}/${batch.split("/")[0].toUpperCase()}-VERIFY-${batch.split("/")[1]}.md`, line: 12, ...over,
});

/** The harvest context: project shop, a fixed date, no topic refused. */
export const context = (refused: readonly string[] = []) =>
  ({ project: "shop", date: "2026-10-24", refusedTopics: new Set<string>(refused) });

/** One gap, written three ways, in three batches. */
export const GAP_IN_THREE_BATCHES: readonly LearnRow[] = [
  row("a/F1", "No test of the empty cart"), row("b/F2", "no test of the empty cart"), row("c/F1", "No test of the empty cart!"),
];

/** One gap in two batches, the first seen twice. */
export const GAP_IN_TWO_BATCHES: readonly LearnRow[] = [row("a/F1", "Gap"), row("a/F1", "Gap"), row("b/F1", "Gap")];

/** The gap "Gap" in three batches. */
export const GAP_THREE_TIMES: readonly LearnRow[] = ["a/F1", "b/F1", "c/F1"].map((b) => row(b, "Gap"));

/** The gap "Gap" in forty batches, each with a long evidence. */
export const GAP_FORTY_TIMES: readonly LearnRow[] =
  Array.from({ length: 40 }, (_, i) => row(`b${i}/F1`, "Gap", { evidence: "x".repeat(150) }));

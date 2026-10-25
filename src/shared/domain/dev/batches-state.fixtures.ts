// Batches-state logs parseBatchesState is tested on.
import { readFileSync } from "node:fs";

/** The demo log: F1 merged, F2 returned GAPS after its relaunch. */
export const DEMO_LOG = readFileSync(
  new URL("../../../../tests/fixtures/dev/workbench/demo/DEMO-BATCHES-STATE.md", import.meta.url), "utf8");

/** The demo log's entries as [batch, event, detail]. */
export const DEMO_ENTRIES: readonly (string | undefined)[][] = [
  ["F1", "launched", ""], ["F1", "returned", "VALID"], ["F1", "merged", "a1b2c3d"],
  ["F2", "launched", ""], ["F2", "returned", "GAPS"], ["F2", "relaunched", ""], ["F2", "returned", "GAPS"],
];

/** The demo log with F2 relaunched once more. */
export const RELAUNCHED_LOG = `${DEMO_LOG}- 2026-10-21 09:45 F2 relaunched\n`;

/** The relaunched log, then a closed line. */
export const CLOSED_LOG = `${RELAUNCHED_LOG}- 2026-10-21 10:00 closed\n`;

/** F3 launched then stalled, the run closed, then F4 launched. */
export const STALL_THEN_REOPEN_LOG = [
  "- 2026-10-21 10:00 F3 launched", "- 2026-10-21 10:32 F3 stall 10:20 12m",
  "- 2026-10-21 10:40 closed", "- 2026-10-21 11:00 F4 launched",
].join("\n");

/** A table, free text, a line without a time and an unknown event: no entry. */
export const NOISE_LOG =
  "| Batch | State |\n|---|---|\n| F1 | done |\nfree text\n- 2026-10-21 F1 launched\n- 2026-10-21 10:00 F1 exploded\n";

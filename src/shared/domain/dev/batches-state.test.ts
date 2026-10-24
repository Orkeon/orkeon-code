// Batches-state log, read only. Run:
//   node --test src/shared/domain/dev/batches-state.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { parseBatchesState } from "./batches-state.ts";

const FIXTURE = readFileSync(
  new URL("../../../../tests/fixtures/dev/workbench/demo/DEMO-BATCHES-STATE.md", import.meta.url), "utf8");

describe("parseBatchesState", () => {
  it("reads the demo log: F2 returned GAPS after its relaunch, so nothing is open, the run is not closed", () => {
    const s = parseBatchesState(FIXTURE);
    deepStrictEqual(s.open, []);
    strictEqual(s.closed, false);
    deepStrictEqual(s.entries.map((e) => [e.batch, e.event, e.detail]), [
      ["F1", "launched", ""], ["F1", "returned", "VALID"], ["F1", "merged", "a1b2c3d"],
      ["F2", "launched", ""], ["F2", "returned", "GAPS"], ["F2", "relaunched", ""], ["F2", "returned", "GAPS"],
    ]);
    deepStrictEqual([s.entries[0].date, s.entries[0].time, s.entries[0].line], ["2026-10-20", "13:15", 5]);
  });

  it("a trailing closed line closes the run and leaves nothing open", () => {
    const relaunched = `${FIXTURE}- 2026-10-21 09:45 F2 relaunched\n`;
    deepStrictEqual(parseBatchesState(relaunched).open, ["F2"]);
    const s = parseBatchesState(`${relaunched}- 2026-10-21 10:00 closed\n`);
    deepStrictEqual(s.open, []);
    strictEqual(s.closed, true);
    deepStrictEqual(s.entries.at(-1), { date: "2026-10-21", time: "10:00", event: "closed", detail: "", line: 13 });
  });

  it("a stall keeps a batch open, and a launch after a close reopens it", () => {
    const s = parseBatchesState([
      "- 2026-10-21 10:00 F3 launched", "- 2026-10-21 10:32 F3 stall 10:20 12m",
      "- 2026-10-21 10:40 closed", "- 2026-10-21 11:00 F4 launched",
    ].join("\n"));
    deepStrictEqual(s.entries[1].detail, "10:20 12m");
    deepStrictEqual(s.open, ["F4"]);
    strictEqual(s.closed, false);
  });

  it("ignores noise lines", () => {
    const s = parseBatchesState("| Batch | State |\n|---|---|\n| F1 | done |\nfree text\n- 2026-10-21 F1 launched\n- 2026-10-21 10:00 F1 exploded\n");
    deepStrictEqual(s.entries, []);
    deepStrictEqual(s.open, []);
    strictEqual(s.closed, false);
  });
});

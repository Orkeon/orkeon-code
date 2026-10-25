// Batches-state log, read only. Run:
//   node --test src/shared/domain/dev/batches-state.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { parseBatchesState } from "./batches-state.ts";
import {
  CLOSED_LOG, DEMO_ENTRIES, DEMO_LOG, NOISE_LOG, RELAUNCHED_LOG, STALL_THEN_REOPEN_LOG,
} from "./batches-state.fixtures.ts";

describe("parseBatchesState", () => {
  it("reads the demo log: F2 returned GAPS after its relaunch, so nothing is open, the run is not closed", () => {
    // Arrange
    const text = DEMO_LOG;

    // Act
    const s = parseBatchesState(text);

    // Assert
    deepStrictEqual(s.open, []);
    strictEqual(s.closed, false);
    deepStrictEqual(s.entries.map((e) => [e.batch, e.event, e.detail]), DEMO_ENTRIES);
    deepStrictEqual([s.entries[0].date, s.entries[0].time, s.entries[0].line], ["2026-10-20", "13:15", 5]);
  });

  it("a relaunch with no return after it leaves the batch open", () => {
    // Arrange
    const text = RELAUNCHED_LOG;

    // Act
    const s = parseBatchesState(text);

    // Assert
    deepStrictEqual(s.open, ["F2"]);
  });

  it("a trailing closed line closes the run and leaves nothing open", () => {
    // Arrange
    const text = CLOSED_LOG;

    // Act
    const s = parseBatchesState(text);

    // Assert
    deepStrictEqual(s.open, []);
    strictEqual(s.closed, true);
    deepStrictEqual(s.entries.at(-1), { date: "2026-10-21", time: "10:00", event: "closed", detail: "", line: 13 });
  });

  it("a stall keeps a batch open, and a launch after a close reopens it", () => {
    // Arrange
    const text = STALL_THEN_REOPEN_LOG;

    // Act
    const s = parseBatchesState(text);

    // Assert
    deepStrictEqual(s.entries[1].detail, "10:20 12m");
    deepStrictEqual(s.open, ["F4"]);
    strictEqual(s.closed, false);
  });

  it("ignores noise lines", () => {
    // Arrange
    const text = NOISE_LOG;

    // Act
    const s = parseBatchesState(text);

    // Assert
    deepStrictEqual(s.entries, []);
    deepStrictEqual(s.open, []);
    strictEqual(s.closed, false);
  });
});

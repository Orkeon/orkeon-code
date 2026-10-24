// The lines /dev-batches appends to `.orkeon/dev/<code>/batches-state.md`, read back by the shared
// parser the start scripts and dev-run.sh follow. Run:
//   node --test src/crews/dev-batches/domain/batches-log.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { parseBatchesState } from "../../../shared/domain/dev/batches-state.ts";
import { appendToLog, batchesLogPath, closedLine, eventLine, lastEntryOf, stamp } from "./batches-log.ts";

const AT = new Date(Date.UTC(2026, 9, 24, 7, 5));

describe("batches log", () => {
  it("stamps in UTC and keeps a detail on one bounded line", () => {
    strictEqual(stamp(AT), "2026-10-24 07:05");
    strictEqual(eventLine(AT, "F2", "launched"), "- 2026-10-24 07:05 F2 launched");
    strictEqual(eventLine(AT, "F2", "stopped", "BLOCKED —\n two\tlines"), "- 2026-10-24 07:05 F2 stopped BLOCKED — two lines");
    strictEqual(eventLine(AT, "F2", "stopped", "x".repeat(300)).length, "- 2026-10-24 07:05 F2 stopped ".length + 200);
    strictEqual(batchesLogPath("demo"), "/workspace/.orkeon/dev/demo/batches-state.md");
  });

  it("starts a new log with its title and reads back what it appended, closed last", () => {
    const text = appendToLog(null, "demo", [eventLine(AT, "F1", "launched"), eventLine(AT, "F1", "returned", "VALID"),
      eventLine(AT, "F1", "merged", "abc1234"), closedLine(AT)]);
    strictEqual(text.split("\n")[0], "# DEMO-BATCHES-STATE");
    const state = parseBatchesState(text);
    strictEqual(state.closed, true);
    deepStrictEqual(state.entries.map((e) => e.event), ["launched", "returned", "merged", "closed"]);
    strictEqual(lastEntryOf(state.entries, "F1")?.event, "merged");
    strictEqual(lastEntryOf(state.entries, "F2"), undefined);
  });

  it("appends after a log that does not end with a newline", () => {
    const text = appendToLog("# DEMO-BATCHES-STATE\n\n## Log\n\n- 2026-10-24 07:05 F1 launched", "demo", [eventLine(AT, "F1", "relaunched")]);
    deepStrictEqual(parseBatchesState(text).entries.map((e) => e.event), ["launched", "relaunched"]);
  });
});

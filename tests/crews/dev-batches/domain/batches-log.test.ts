// The lines /dev-batches appends to `.orkeon/dev/<code>/batches-state.md`, read back by the shared
// parser the start scripts and dev-run.sh follow. Run:
//   node --test tests/crews/dev-batches/domain/batches-log.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { parseBatchesState } from "../../../../src/shared/domain/dev/batches-state.ts";
import { appendToLog, batchesLogPath, eventLine, lastEntryOf, stamp } from "../../../../src/crews/dev-batches/domain/batches-log.ts";
import { AT, EVENT_LINES, F1_MERGED_LINES, LOG_WITHOUT_FINAL_NEWLINE } from "./batches-log.fixtures.ts";
import { assertLogReadsBack } from "./batches-log.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("batches log", () => {
  it("stamps in UTC", () => {
    // Arrange
    const at = AT;

    // Act
    const text = stamp(at);

    // Assert
    strictEqual(text, "2026-10-24 07:05");
  });

  for (const c of EVENT_LINES) {
    it(c.name, () => {
      // Arrange
      const { batch, event, detail } = c;

      // Act
      const line = eventLine(AT, batch, event, detail);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  it("bounds a detail at 200 characters", () => {
    // Arrange
    const detail = "x".repeat(300);

    // Act
    const line = eventLine(AT, "F2", "stopped", detail);

    // Assert
    strictEqual(line.length, "- 2026-10-24 07:05 F2 stopped ".length + 200);
  });

  it("keeps the log under the workspace's .orkeon/dev/<code>", () => {
    // Arrange
    const code = "demo";

    // Act
    const path = batchesLogPath(code);

    // Assert
    strictEqual(path, `${WORKSPACE}/.orkeon/dev/demo/batches-state.md`);
  });

  it("starts a new log with its title", () => {
    // Arrange
    const lines = F1_MERGED_LINES;

    // Act
    const text = appendToLog(null, "demo", lines);

    // Assert
    strictEqual(text.split("\n")[0], "# DEMO-BATCHES-STATE");
  });

  it("reads back what it appended to a new log, closed last", () => {
    // Arrange
    const lines = F1_MERGED_LINES;

    // Act
    const text = appendToLog(null, "demo", lines);

    // Assert
    assertLogReadsBack(text, ["launched", "returned", "merged", "closed"], true);
  });

  it("appends after a log that does not end with a newline", () => {
    // Arrange
    const lines = [eventLine(AT, "F1", "relaunched")];

    // Act
    const text = appendToLog(LOG_WITHOUT_FINAL_NEWLINE, "demo", lines);

    // Assert
    assertLogReadsBack(text, ["launched", "relaunched"]);
  });
});

describe("lastEntryOf", () => {
  it("names a batch's last entry", () => {
    // Arrange
    const { entries } = parseBatchesState(appendToLog(null, "demo", F1_MERGED_LINES));

    // Act
    const last = lastEntryOf(entries, "F1");

    // Assert
    strictEqual(last?.event, "merged");
  });

  it("names none for a batch the log does not hold", () => {
    // Arrange
    const { entries } = parseBatchesState(appendToLog(null, "demo", F1_MERGED_LINES));

    // Act
    const last = lastEntryOf(entries, "F2");

    // Assert
    strictEqual(last, undefined);
  });
});

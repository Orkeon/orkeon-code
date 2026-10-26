// Checks on a batches log, read back by the shared parser.
import { deepStrictEqual, strictEqual } from "node:assert";
import { parseBatchesState } from "../../../../src/shared/domain/dev/batches-state.ts";

/** `text` reads back as the entries of `events`, in order, and is closed or not as `closed` says. */
export function assertLogReadsBack(text: string, events: readonly string[], closed?: boolean): void {
  const state = parseBatchesState(text);
  if (closed !== undefined) strictEqual(state.closed, closed, `the log is ${state.closed ? "" : "not "}closed`);
  deepStrictEqual(state.entries.map((e) => e.event), events, "the log does not read back as the events appended");
}

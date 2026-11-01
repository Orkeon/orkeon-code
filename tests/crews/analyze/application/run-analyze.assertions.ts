// The checks of the run-analyze tests made of more than one assertion.
import { deepStrictEqual } from "node:assert";

import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** The indexing ran with the runtime's default parallelism, and the log said exactly `lines`. */
export function assertDefaultIndexing(calls: readonly string[], logged: readonly string[], lines: readonly string[]): void {
  deepStrictEqual(calls, ["rootCount", `index ${WORKSPACE}`], "the indexing should get no parallelism");
  deepStrictEqual(logged, lines, "the log should say exactly the expected lines");
}

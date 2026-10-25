// Checks on the rows of the mechanical table.
import { deepStrictEqual } from "node:assert";
import type { TableRow } from "./mechanical-table.ts";
import type { RowOutcome } from "./mechanical-table.fixtures.ts";

/** `row` has the result and evidence expected, whatever its axis and check. */
export function assertRowOutcome(row: TableRow, expected: RowOutcome): void {
  deepStrictEqual({ result: row.result, evidence: row.evidence }, expected,
    `the row ${row.axis}: ${row.check} has another result or evidence`);
}

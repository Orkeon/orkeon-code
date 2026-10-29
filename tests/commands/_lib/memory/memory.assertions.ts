// Checks on /memory typed as /feedback: the text shown and the memories the store holds after it.
import { deepStrictEqual } from "node:assert";

import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import type { MemoryRecord } from "./memory.fixtures.ts";

/** /feedback showed its text and the store holds exactly the records expected (none added on a refusal). */
export function assertFeedbackAnswered(
  view: CommandView, records: readonly unknown[], text: string, expected: readonly MemoryRecord[],
): void {
  deepStrictEqual(view, { text }, `/feedback did not show ${JSON.stringify(text)}`);
  deepStrictEqual(records, expected, "/feedback left the memory store with other records than expected");
}

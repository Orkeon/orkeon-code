// Checks on /mode typed as /plan: the text shown, the mode the session keeps and the lines logged.
import { deepStrictEqual, strictEqual } from "node:assert";

import type { CommandView } from "../../../../src/commands/_lib/view.ts";

/** What a /plan toggle is expected to leave: the text, the session's mode and the log. */
export interface PlanToggle {
  text: string;
  mode: string;
  logLines: readonly string[];
}

/** The toggle showed its text, left the session in its mode and logged its lines, nothing else. */
export function assertPlanToggled(view: CommandView, mode: unknown, logLines: readonly string[], expected: PlanToggle): void {
  deepStrictEqual(view, { text: expected.text }, `/plan did not show ${JSON.stringify(expected.text)}`);
  strictEqual(mode, expected.mode, `/plan left the session in '${String(mode)}', not '${expected.mode}'`);
  deepStrictEqual(logLines, expected.logLines, "/plan did not log the expected lines");
}

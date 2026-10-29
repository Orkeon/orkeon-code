// Checks on /passes (runPasses): the text shown and the pass count the session keeps after it.
import { deepStrictEqual, strictEqual } from "node:assert";

import type { CommandView } from "../../../../src/commands/_lib/view.ts";

/** /passes showed its text and the session holds the count expected: `undefined` when it must hold none. */
export function assertPassesAnswered(view: CommandView, held: string | undefined, text: string, expected: string | undefined): void {
  deepStrictEqual(view, { text }, `/passes did not show ${JSON.stringify(text)}`);
  strictEqual(held, expected, `/passes left the session's count at ${String(held)}, not ${String(expected)}`);
}

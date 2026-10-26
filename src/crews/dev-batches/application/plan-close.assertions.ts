// Checks on the close of a plan: whether it closed, and how many pull requests the opener received.
import { deepStrictEqual } from "node:assert";

import type { FakePullRequestOpener } from "../../../../tests/support/doubles/fake-pull-request-opener.ts";
import type { PlanClose } from "./plan-close.ts";

/** The close is `closed` and the opener received `opened` pull requests. */
export function assertClose(close: PlanClose, opener: FakePullRequestOpener, expected: { closed: boolean; opened: number }): void {
  deepStrictEqual({ closed: close.closed, opened: opener.opened.length }, expected, `not the close expected:\n${close.lines.join("\n")}`);
}

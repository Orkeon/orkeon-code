// Checks on the buffer compactSession leaves.
import { deepStrictEqual, ok } from "node:assert";
import type { CompactOutcome } from "../../../../src/shared/domain/compact-outcome.ts";
import type { SessionMsg } from "../../../../src/shared/domain/types.ts";
import type { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { LAST_TWO_TURNS_KEEP, snipFallbackBuffer } from "./compact-session.fixtures.ts";

/** No message of the buffer points at a state file. */
export function assertNoStatePointer(messages: readonly SessionMsg[]): void {
  const pointer = messages.find((m) => String(m.content).startsWith("[restored-state]"));
  ok(pointer === undefined, `a state pointer in the buffer: ${String(pointer?.content)}`);
}

/** The summary failed for `reason`: the outcome says so with the snip fallback, the buffer (THREE_TURNS) was snipped
 *  once to its last two turns, and carries, right after its head, the notice that the turns it removed were not
 *  summarised. */
export function assertSnipFallback(outcome: CompactOutcome, session: FakeSessionStore, reason: string): void {
  deepStrictEqual(outcome, { status: "failed", reason, fallback: "snip" }, "the outcome of a summary that failed");
  deepStrictEqual(session.snips, [LAST_TWO_TURNS_KEEP], "the fallback snips the buffer once, to its last two turns");
  deepStrictEqual(session.messages, snipFallbackBuffer(), "the snipped buffer opens on the notice after its head");
}

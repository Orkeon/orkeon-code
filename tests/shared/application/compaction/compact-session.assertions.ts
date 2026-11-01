// Checks on the buffer compactSession leaves.
import { deepStrictEqual, ok } from "node:assert";
import type { CompactOutcome } from "../../../../src/shared/domain/compact-outcome.ts";
import { SNIP_RETAIN_COUNT } from "../../../../src/shared/domain/compaction-thresholds.ts";
import type { SessionMsg } from "../../../../src/shared/domain/types.ts";
import type { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { snipFallbackBuffer } from "./compact-session.fixtures.ts";

/** No message of the buffer points at a state file. */
export function assertNoStatePointer(messages: readonly SessionMsg[]): void {
  const pointer = messages.find((m) => String(m.content).startsWith("[restored-state]"));
  ok(pointer === undefined, `a state pointer in the buffer: ${String(pointer?.content)}`);
}

/** The summary failed for `reason`: the outcome says so with the snip fallback, the buffer was snipped once and
 *  carries, right after its head, the notice that the turns it removed were not summarised. */
export function assertSnipFallback(outcome: CompactOutcome, session: FakeSessionStore, reason: string): void {
  deepStrictEqual(outcome, { status: "failed", reason, fallback: "snip" }, "the outcome of a summary that failed");
  deepStrictEqual(session.snips, [SNIP_RETAIN_COUNT], "the fallback snips the buffer once");
  deepStrictEqual(session.messages, snipFallbackBuffer(), "the snipped buffer opens on the notice after its head");
}

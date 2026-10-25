// Checks on the buffer compactSession leaves.
import { ok } from "node:assert";
import type { SessionMsg } from "../../domain/types.ts";

/** No message of the buffer points at a state file. */
export function assertNoStatePointer(messages: readonly SessionMsg[]): void {
  const pointer = messages.find((m) => String(m.content).startsWith("[restored-state]"));
  ok(pointer === undefined, `a state pointer in the buffer: ${String(pointer?.content)}`);
}

// The checks of the compaction tests made of more than one native assertion.
import { ok, strictEqual } from "node:assert";

/** A system message whose content opens with `marker`. */
export function assertMarkedSystemMessage(msg: { role: string; content: string }, marker: string): void {
  strictEqual(msg.role, "system", `the message is no system message: ${JSON.stringify(msg)}`);
  ok(msg.content.startsWith(marker + " "), `the message does not open with ${JSON.stringify(marker)}:\n${msg.content}`);
}

// /clear: empties the conversation buffer and keeps the session's permission mode. The runtime's reset empties the
// state bag too (Orkeon's ISessionBufferService.Reset), which used to drop a `/mode bypassPermissions` back to the
// fallback mode at every /clear; the mode read before the reset is written back after it.
import type { SessionStore } from "../../../shared/application/ports.ts";
import { DEFAULT_MODE_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { conversationCleared, modeKept, modeNotKept } from "./messages.ts";

export interface ClearDeps {
  session: Pick<SessionStore, "reset" | "readState" | "writeState">;
}

/** Empties the buffer and writes the session's permission mode back; the line to show. */
export async function runClear(deps: ClearDeps): Promise<string> {
  const mode = await deps.session.readState(DEFAULT_MODE_STATE_KEY).catch(() => null);
  const removed = await deps.session.reset();
  const cleared = conversationCleared(removed);
  if (mode === null || mode.trim() === "") return cleared;
  try {
    await deps.session.writeState(DEFAULT_MODE_STATE_KEY, mode);
    return `${cleared} ${modeKept(mode)}`;
  } catch {
    return `${cleared} ${modeNotKept(mode)}`;
  }
}

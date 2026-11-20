// /clear: empties the conversation buffer and keeps the session's permission mode and /model choice. The runtime's
// reset empties the state bag too (Orkeon's ISessionBufferService.Reset), which used to drop a `/mode
// bypassPermissions` back to the fallback mode and a /model override back to the boot model at every /clear; what
// they held before the reset is written back after it.
import type { SessionStore } from "../../../shared/application/ports.ts";
import { DEFAULT_MODE_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { MODEL_SETTING, MODE_SETTING, conversationCleared, settingKept, settingNotKept } from "./messages.ts";

export interface ClearDeps {
  session: Pick<SessionStore, "reset" | "readState" | "writeState">;
}

/** What /clear writes back, each with the name its line gives it. */
const KEPT: ReadonlyArray<{ key: string; setting: string }> = [
  { key: DEFAULT_MODE_STATE_KEY, setting: MODE_SETTING },
  { key: MODEL_PREFERENCE_STATE_KEY, setting: MODEL_SETTING },
];

/** Empties the buffer and writes the permission mode and the /model choice back; the line to show. */
export async function runClear(deps: ClearDeps): Promise<string> {
  const before = await Promise.all(
    KEPT.map(async (entry) => ({ ...entry, value: ((await deps.session.readState(entry.key).catch(() => null)) ?? "").trim() })),
  );
  const removed = await deps.session.reset();
  const lines = [conversationCleared(removed)];
  for (const { key, setting, value } of before) {
    if (value === "") continue;
    try {
      await deps.session.writeState(key, value);
      lines.push(settingKept(setting, value));
    } catch {
      lines.push(settingNotKept(setting, value));
    }
  }
  return lines.join(" ");
}

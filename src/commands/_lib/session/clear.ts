// /clear: empties the conversation buffer and keeps the session's permission mode and /model choice. The runtime's
// reset empties the state bag too (Orkeon's ISessionBufferService.Reset), which used to drop a `/mode
// bypassPermissions` back to the fallback mode and a /model override back to the boot model at every /clear; what
// they held before the reset is written back after it, as it was read. A value the loop would ignore (a token that is
// no permission mode, an empty model after /model reset) is not written back: the session runs on its default either
// way. A setting that cannot be read before the reset is lost, and its line says so.
import type { SessionStore } from "../../../shared/application/ports.ts";
import { isPermissionMode } from "../../../shared/domain/permission-modes.ts";
import { DEFAULT_MODE_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { MODEL_SETTING, MODE_SETTING, conversationCleared, settingKept, settingNotKept, settingUnread } from "./messages.ts";

export interface ClearDeps {
  session: Pick<SessionStore, "reset" | "readState" | "writeState">;
}

/** What /clear writes back, each with the name its line gives it and the values the loop acts on. */
const KEPT: ReadonlyArray<{ key: string; setting: string; heeded: (value: string) => boolean }> = [
  { key: DEFAULT_MODE_STATE_KEY, setting: MODE_SETTING, heeded: isPermissionMode },
  { key: MODEL_PREFERENCE_STATE_KEY, setting: MODEL_SETTING, heeded: (value) => value.trim() !== "" },
];

/** What a read before the reset gave: the stored value, null when none, `unread` when the read failed. */
type Before = string | null | { unread: true };

/** Empties the buffer and writes the permission mode and the /model choice back; the line to show. */
export async function runClear(deps: ClearDeps): Promise<string> {
  const before = await Promise.all(
    KEPT.map(async (entry) => ({
      ...entry,
      value: await deps.session.readState(entry.key).then((v): Before => v, (): Before => ({ unread: true })),
    })),
  );
  const removed = await deps.session.reset();
  const lines = [conversationCleared(removed)];
  for (const { key, setting, heeded, value } of before) {
    if (value !== null && typeof value === "object") {
      lines.push(settingUnread(setting));
      continue;
    }
    if (value === null || !heeded(value)) continue;
    try {
      await deps.session.writeState(key, value);
      lines.push(settingKept(setting, value.trim()));
    } catch {
      lines.push(settingNotKept(setting, value.trim()));
    }
  }
  return lines.join(" ");
}

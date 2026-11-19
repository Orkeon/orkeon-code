// A session for /clear (commands/_lib/session/clear.ts): a buffer of `messages` messages, the permission mode /mode
// stored and the model /model stored, each when given, and an effort /effort stored, always there for /clear to drop.
import { DEFAULT_MODE_STATE_KEY, EFFORT_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

export function clearSession({ messages = 3, mode, model }: { messages?: number; mode?: string; model?: string } = {}): FakeSessionStore {
  const session = new FakeSessionStore();
  session.messages = Array.from({ length: messages }, (_, i) => ({ role: "user", content: `m${i}` }));
  if (mode !== undefined) session.state.set(DEFAULT_MODE_STATE_KEY, mode);
  if (model !== undefined) session.state.set(MODEL_PREFERENCE_STATE_KEY, model);
  session.state.set(EFFORT_STATE_KEY, "high");
  return session;
}

/** The line /clear shows after removing 1 message when neither the mode nor the model could be written back. */
export const NOTHING_KEPT_LINE =
  "conversation cleared (1 messages removed). " +
  "⚠ Permission mode bypassPermissions could not be written back: the session is on its default. " +
  "⚠ Model claude-mythos-5-2 could not be written back: the session is on its default.";

// A session for /clear (commands/_lib/session/clear.ts): a buffer of `messages` messages and, when given, the
// permission mode /mode stored; a /model override is always there, for /clear to drop.
import { DEFAULT_MODE_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

export function clearSession({ messages = 3, mode }: { messages?: number; mode?: string } = {}): FakeSessionStore {
  const session = new FakeSessionStore();
  session.messages = Array.from({ length: messages }, (_, i) => ({ role: "user", content: `m${i}` }));
  if (mode !== undefined) session.state.set(DEFAULT_MODE_STATE_KEY, mode);
  session.state.set(MODEL_PREFERENCE_STATE_KEY, "kimi-k3");
  return session;
}

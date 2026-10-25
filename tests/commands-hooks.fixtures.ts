// Sessions /hooks reads and writes its hooks in.
import { HOOKS_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "./support/doubles/fake-session-store.ts";

/** The hooks a session holds, as /hooks stored them. */
export const stored = (session: FakeSessionStore): unknown => JSON.parse(session.state.get(HOOKS_STATE_KEY) ?? "[]");

/** A session holding `hooks`, stored as /hooks stores them. */
export function sessionWithHooks(hooks: readonly { event: string; command: string }[]): FakeSessionStore {
  const session = new FakeSessionStore();
  session.state.set(HOOKS_STATE_KEY, JSON.stringify(hooks));
  return session;
}

export const PRE_TOOL_HOOK = { event: "pre-tool", command: "node .orkeon/hooks/pre.mjs {tool}" };

/** Every dev step that takes the hooks. */
export const HOOKED_STEPS = ["/dev-spec", "/dev-change", "/dev-plan", "/dev-implement", "/dev-batches", "/dev-verify", "/tasks repair"];

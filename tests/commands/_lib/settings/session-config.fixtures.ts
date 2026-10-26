// The toggle command /fast is built from, and the sessions it runs against.
import { toggleCommand } from "../../../../src/commands/_lib/settings/session-config.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

/** A session whose state bag cannot be read, but can be written. */
export function unreadableStateStore(): FakeSessionStore {
  const session = new FakeSessionStore();
  session.readStateFailure = new Error("no session tools");
  return session;
}

export const SPEC = { name: "fast", description: "Toggle fast mode.", key: "fast_mode", note: "turns skip two blocks" };

/** The toggle's descriptor, and its handler run against a context whose continue
 *  echoes the text. */
export function defineToggle(session: FakeSessionStore) {
  const { handler, ...descriptor } = toggleCommand(SPEC, session);
  const press = (...raw: string[]) => handler({ raw }, { continue: (text: string) => text });
  return { descriptor, press };
}

/** A session whose flag holds `value`, or no flag when null. */
export function sessionWithFlag(value: string | null): FakeSessionStore {
  const session = new FakeSessionStore();
  if (value !== null) session.state.set(SPEC.key, value);
  return session;
}

/** Explicit presses, each from the flag it found, and the flag it leaves. */
export const EXPLICIT_CASES: readonly { name: string; raw: string; from: string | null; flag: string }[] = [
  { name: "ON sets it from no flag", raw: "ON", from: null, flag: "true" },
  { name: "on keeps it on", raw: "on", from: "true", flag: "true" },
  { name: "off sets it off from on", raw: "off", from: "true", flag: "false" },
];

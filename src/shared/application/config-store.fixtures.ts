// The two-layer /config store over FakeFiles and FakeSessionStore.
import { CONFIG_FILE_PATH, createConfigStore } from "./config-store.ts";
import { CONFIG_MAP_STATE_KEY } from "../domain/session-keys.ts";
import { FakeFiles } from "../../../tests/support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";

/** The fakes and the config store built on them. */
export function configHarness() {
  const files = new FakeFiles();
  const session = new FakeSessionStore();
  return { files, session, config: createConfigStore({ files, session }) };
}

/** A project file setting the fallback to plan and the lenses to style, a session overriding the fallback only. */
export function sessionOverFile() {
  const harness = configHarness();
  harness.files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "plan", "review.lenses": "style" }));
  harness.session.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ "permissions.fallback": "acceptEdits" }));
  return harness;
}

/** A file holding malformed JSON. */
export const MALFORMED_PROJECT_FILE = `{ "permissions.fallback": "plan",`;

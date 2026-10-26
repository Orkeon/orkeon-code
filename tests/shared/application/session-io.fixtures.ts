// The session service over FakeSessionStore and a config store on FakeFiles.
import { createSessionIo } from "../../../src/shared/application/session-io.ts";
import { createConfigStore } from "../../../src/shared/application/config-store.ts";
import { FALLBACK_PERMISSION_MODE, resolveFallbackMode } from "../../../src/shared/domain/permission-modes.ts";
import { FakeFiles } from "../../support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../support/doubles/fake-session-store.ts";

/** The fakes and the session service built on them. */
export function sessionHarness() {
  const files = new FakeFiles();
  const store = new FakeSessionStore();
  const config = createConfigStore({ files, session: store });
  return { files, store, session: createSessionIo({ store, config }) };
}

/** A session service whose store and config both fail. */
export function failingSession() {
  const store = new FakeSessionStore();
  store.failure = new Error("no session_store tool");
  const failingConfig = { readValue: () => Promise.reject(new Error("unreadable")) };
  return createSessionIo({ store, config: failingConfig });
}

/** The effective mode when nothing is set: the built-in fallback, with its explanation. */
export function builtInEffectiveMode() {
  return { mode: FALLBACK_PERMISSION_MODE, via: resolveFallbackMode(undefined).explanation };
}

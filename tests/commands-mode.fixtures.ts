// The session service /mode runs over, and the texts it answers with.
import { createConfigStore } from "../src/shared/application/config-store.ts";
import { createSessionIo } from "../src/shared/application/session-io.ts";
import { PERMISSION_MODES } from "../src/shared/domain/permission-modes.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";

export const SET_NOTE = `(prompts without a "mode:" prefix now run in it; /clear restores 'default').`;

export const STRIPPED = (mode: string): string =>
  `info: entering '${mode}': the edit, network and shell tools stripped from the catalogue`;

export const MODE_USAGE = `usage: /mode [<${PERMISSION_MODES.join("|")}>|show] — bare /mode cycles; ` +
  `an explicit "mode:" prefix on a prompt still wins.`;

/** The session service over an empty store, and a logger: what runMode takes, the store beside it. */
export function modeDeps() {
  const files = new FakeFiles();
  const store = new FakeSessionStore();
  const session = createSessionIo({ store, config: createConfigStore({ files, session: store }) });
  return { store, session, log: new FakeLogger() };
}

/** Every mode /plan enters plan from, a missing one among them. */
export const NOT_PLAN: readonly (string | null | undefined)[] = [null, undefined, "", "default", "acceptEdits", "bypassPermissions"];

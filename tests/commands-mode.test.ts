// The session-default permission mode (commands/_lib/mode.ts): /mode over the
// session service on FakeSessionStore and FakeLogger, and the /plan toggle. Run:
//   node --test tests/commands-mode.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { runMode, togglePlanMode } from "../src/commands/_lib/mode.ts";
import { createConfigStore } from "../src/shared/application/config-store.ts";
import { createSessionIo } from "../src/shared/application/session-io.ts";
import { PERMISSION_MODES, resolveFallbackMode } from "../src/shared/domain/permission-modes.ts";
import { DEFAULT_MODE_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";

const SET_NOTE = `(prompts without a "mode:" prefix now run in it; /clear restores 'default').`;
const STRIPPED = (mode: string) =>
  `info: entering '${mode}': the edit, network and shell tools stripped from the catalogue`;

function setup() {
  const files = new FakeFiles();
  const store = new FakeSessionStore();
  const session = createSessionIo({ store, config: createConfigStore({ files, session: store }) });
  const log = new FakeLogger();
  const run = (...tokens: string[]) => runMode(tokens, { session, log });
  return { store, log, run };
}

describe("/mode (bare) — cycles", () => {
  it("cycles from the effective mode, the fallback when /mode set none", async () => {
    const { store, log, run } = setup();
    deepStrictEqual(await run(), { text: `session default permission mode cycled default → 'acceptEdits' ${SET_NOTE}` });
    strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), "acceptEdits");
    deepStrictEqual(log.lines, []);
  });

  it("logs the catalogue strip when it cycles into a read-only mode", async () => {
    const { store, log, run } = setup();
    store.state.set(DEFAULT_MODE_STATE_KEY, "acceptEdits");
    deepStrictEqual(await run(), { text: `session default permission mode cycled acceptEdits → 'plan' ${SET_NOTE}` });
    deepStrictEqual(log.lines, [STRIPPED("plan")]);
  });
});

describe("/mode show", () => {
  it("shows the effective mode and where it comes from, without changing it", async () => {
    const { store, run } = setup();
    const usage = `usage: /mode [<${PERMISSION_MODES.join("|")}>|show] — bare /mode cycles; ` +
      `an explicit "mode:" prefix on a prompt still wins.`;
    deepStrictEqual(await run("show"), {
      text: `session default permission mode: default\n  ↳ ${resolveFallbackMode(undefined).explanation}\n${usage}`,
    });
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");
    deepStrictEqual(await run("show"), {
      text: `session default permission mode: plan\n  ↳ session default via /mode\n${usage}`,
    });
    strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), "plan");
  });
});

describe("/mode <mode>", () => {
  it("sets a mode, logging the strip of a read-only one", async () => {
    const { store, log, run } = setup();
    deepStrictEqual(await run("bypassPermissions"), { text: `session default permission mode set to 'bypassPermissions' ${SET_NOTE}` });
    deepStrictEqual(await run("dontAsk"), { text: `session default permission mode set to 'dontAsk' ${SET_NOTE}` });
    strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), "dontAsk");
    deepStrictEqual(log.lines, [STRIPPED("dontAsk")]);
  });

  it("refuses an unknown mode with the known ones", async () => {
    const { store, run } = setup();
    deepStrictEqual(await run("Plan"), {
      text: `unknown mode 'Plan' — expected one of: ${PERMISSION_MODES.join(", ")}, show.`,
    });
    strictEqual(store.state.has(DEFAULT_MODE_STATE_KEY), false);
  });
});

describe("/plan — togglePlanMode", () => {
  it("enters plan from anything else", () => {
    for (const from of [null, undefined, "", "default", "acceptEdits", "bypassPermissions"]) {
      deepStrictEqual(togglePlanMode(from), { mode: "plan", entering: true }, String(from));
    }
  });

  it("LEAVES plan when already in it — the toggle the baseline specifies", () => {
    // Pre-B-11 this wrote "plan" unconditionally: /plan twice left the session
    // read-only with no way out but /mode or /clear, reporting success both
    // times.
    deepStrictEqual(togglePlanMode("plan"), { mode: "default", entering: false });
  });

  it("returns to 'default', not to the previous mode", () => {
    // Restoring bypassPermissions on a second /plan would hand back write access
    // nobody asked for on that keystroke.
    strictEqual(togglePlanMode("plan").mode, "default");
  });
});

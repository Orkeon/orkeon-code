// The session service over FakeSessionStore and a config store on FakeFiles. Run:
//   node --test src/shared/application/session-io.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createSessionIo } from "./session-io.ts";
import { CONFIG_FILE_PATH, createConfigStore } from "./config-store.ts";
import { DEFAULT_MODE_STATE_KEY } from "../domain/session-keys.ts";
import { FALLBACK_PERMISSION_MODE, PERMISSION_FALLBACK_CONFIG_KEY, resolveFallbackMode } from "../domain/permission-modes.ts";
import { FakeFiles } from "../../../tests/support/fake-files.ts";
import { FakeSessionStore } from "../../../tests/support/fake-session-store.ts";

function setup() {
  const files = new FakeFiles();
  const store = new FakeSessionStore();
  const config = createConfigStore({ files, session: store });
  return { files, store, session: createSessionIo({ store, config }) };
}

describe("session IO — the store's operations", () => {
  it("round-trips state values, and null removes one", async () => {
    const { store, session } = setup();
    await session.writeState("k", "v");
    strictEqual(await session.readState("k"), "v");
    await session.writeState("k", null);
    strictEqual(await session.readState("k"), null);
    strictEqual(store.state.has("k"), false);
  });

  it("round-trips the buffer", async () => {
    const { session } = setup();
    await session.writeMessages([{ role: "user", content: "hi" }]);
    deepStrictEqual((await session.readMessages()).messages, [{ role: "user", content: "hi" }]);
  });

  it("reads the budget", async () => {
    const { store, session } = setup();
    store.budget = { used: 10, window: 100 };
    deepStrictEqual(await session.readBudget(), { used: 10, window: 100 });
  });

  it("appends a message after the stored ones", async () => {
    const { store, session } = setup();
    store.messages = [{ role: "user", content: "hi" }];
    await session.appendMessage("system", "[note] use pnpm");
    deepStrictEqual(store.messages, [{ role: "user", content: "hi" }, { role: "system", content: "[note] use pnpm" }]);
  });

  it("lets an append throw when the session store is unavailable", async () => {
    const { store, session } = setup();
    store.failure = new Error("no session_store tool");
    await rejects(session.appendMessage("user", "hi"), /no session_store tool/);
  });
});

describe("session IO — reset, snip and title", () => {
  it("passes them to the store", async () => {
    const { store, session } = setup();
    store.messages = [{ role: "user", content: "a" }, { role: "assistant", content: "b" }];
    strictEqual(await session.reset(), 2);
    deepStrictEqual(store.messages, []);
    store.snipped = { removed: 3, retained: 4 };
    deepStrictEqual(await session.snip(2), { removed: 3, retained: 4 });
    deepStrictEqual(store.snips, [2]);
    await session.setTitle("t");
    strictEqual(store.title, "t");
  });
});

describe("session IO — the permission mode", () => {
  it("defaults to the built-in fallback when nothing is set", async () => {
    const { session } = setup();
    strictEqual(await session.readDefaultPermissionMode(), null);
    deepStrictEqual(await session.resolveSessionFallbackMode(), resolveFallbackMode(undefined));
    deepStrictEqual(await session.resolveEffectiveSessionMode(), {
      mode: FALLBACK_PERMISSION_MODE, via: resolveFallbackMode(undefined).explanation,
    });
  });

  it("takes the /mode session default first", async () => {
    const { store, session } = setup();
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");
    strictEqual(await session.readDefaultPermissionMode(), "plan");
    deepStrictEqual(await session.resolveEffectiveSessionMode(), { mode: "plan", via: "session default via /mode" });
  });

  it("ignores a stored session default that is not a mode", async () => {
    const { store, session } = setup();
    store.state.set(DEFAULT_MODE_STATE_KEY, "yolo");
    strictEqual(await session.readDefaultPermissionMode(), null);
  });

  it("reads the fallback from the layered config", async () => {
    const { files, session } = setup();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ [PERMISSION_FALLBACK_CONFIG_KEY]: "acceptEdits" }));
    deepStrictEqual(await session.resolveSessionFallbackMode(), resolveFallbackMode("acceptEdits"));
    strictEqual((await session.resolveEffectiveSessionMode()).mode, "acceptEdits");
  });

  it("falls back to the built-in mode when the store and the config fail", async () => {
    const { store } = setup();
    store.failure = new Error("no session_store tool");
    const failingConfig = { readValue: () => Promise.reject(new Error("unreadable")) };
    const session = createSessionIo({ store, config: failingConfig });
    strictEqual(await session.readDefaultPermissionMode(), null);
    deepStrictEqual(await session.resolveEffectiveSessionMode(), {
      mode: FALLBACK_PERMISSION_MODE, via: resolveFallbackMode(undefined).explanation,
    });
  });
});

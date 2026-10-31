// The session service over FakeSessionStore and a config store on FakeFiles. Run:
//   node --test tests/shared/application/session-io.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { CONFIG_FILE_PATH } from "../../../src/shared/application/config-store.ts";
import { DEFAULT_MODE_STATE_KEY } from "../../../src/shared/domain/session-keys.ts";
import { PERMISSION_FALLBACK_CONFIG_KEY, resolveFallbackMode } from "../../../src/shared/domain/permission-modes.ts";
import { builtInEffectiveMode, failingSession, sessionHarness } from "./session-io.fixtures.ts";

describe("session IO — the store's operations", () => {
  it("reads back a state value written", async () => {
    // Arrange
    const { session } = sessionHarness();
    await session.writeState("k", "v");

    // Act
    const value = await session.readState("k");

    // Assert
    strictEqual(value, "v");
  });

  it("removes a state value written null", async () => {
    // Arrange
    const { store, session } = sessionHarness();
    await session.writeState("k", "v");

    // Act
    await session.writeState("k", null);

    // Assert
    strictEqual(store.state.has("k"), false);
  });

  it("reads null for a state value removed", async () => {
    // Arrange
    const { session } = sessionHarness();
    await session.writeState("k", "v");
    await session.writeState("k", null);

    // Act
    const value = await session.readState("k");

    // Assert
    strictEqual(value, null);
  });

  it("round-trips the buffer", async () => {
    // Arrange
    const { session } = sessionHarness();
    await session.writeMessages([{ role: "user", content: "hi" }]);

    // Act
    const read = await session.readMessages();

    // Assert
    deepStrictEqual(read.messages, [{ role: "user", content: "hi" }]);
  });

  it("reads the budget", async () => {
    // Arrange
    const { store, session } = sessionHarness();
    store.budget = { used: 10, window: 100 };

    // Act
    const budget = await session.readBudget();

    // Assert
    deepStrictEqual(budget, { used: 10, window: 100 });
  });

  it("appends a message after the stored ones", async () => {
    // Arrange
    const { store, session } = sessionHarness();
    store.messages = [{ role: "user", content: "hi" }];

    // Act
    await session.appendMessage("system", "[note] use pnpm");

    // Assert
    deepStrictEqual(store.messages, [{ role: "user", content: "hi" }, { role: "system", content: "[note] use pnpm" }]);
  });

  it("appends a message without reading or rewriting the buffer", async () => {
    // Arrange
    const { store, session } = sessionHarness();

    // Act
    await session.appendMessage("user", "hi");

    // Assert
    deepStrictEqual([store.readMessagesCalls, store.writeMessagesCalls, store.appendCalls], [0, 0, [{ role: "user", content: "hi" }]]);
  });

  it("lets an append throw when the session store is unavailable", async () => {
    // Arrange
    const { store, session } = sessionHarness();
    store.failure = new Error("no session_store tool");

    // Act
    const act = session.appendMessage("user", "hi");

    // Assert
    await rejects(act, /no session_store tool/);
  });
});

describe("session IO — reset, snip and title", () => {
  it("passes a reset to the store", async () => {
    // Arrange
    const { store, session } = sessionHarness();
    store.messages = [{ role: "user", content: "a" }, { role: "assistant", content: "b" }];

    // Act
    const removed = await session.reset();

    // Assert
    strictEqual(removed, 2);
    deepStrictEqual(store.messages, []);
  });

  it("passes a snip to the store", async () => {
    // Arrange
    const { store, session } = sessionHarness();
    store.snipped = { removed: 3, retained: 4 };

    // Act
    const snipped = await session.snip(2);

    // Assert
    deepStrictEqual(snipped, { removed: 3, retained: 4 });
    deepStrictEqual(store.snips, [2]);
  });

  it("passes a title to the store", async () => {
    // Arrange
    const { store, session } = sessionHarness();

    // Act
    await session.setTitle("t");

    // Assert
    strictEqual(store.title, "t");
  });
});

describe("session IO — the permission mode", () => {
  it("reads no session default when nothing is set", async () => {
    // Arrange
    const { session } = sessionHarness();

    // Act
    const mode = await session.readDefaultPermissionMode();

    // Assert
    strictEqual(mode, null);
  });

  it("resolves the built-in fallback when nothing is set", async () => {
    // Arrange
    const { session } = sessionHarness();

    // Act
    const fallback = await session.resolveSessionFallbackMode();

    // Assert
    deepStrictEqual(fallback, resolveFallbackMode(undefined));
  });

  it("defaults to the built-in fallback when nothing is set", async () => {
    // Arrange
    const { session } = sessionHarness();

    // Act
    const effective = await session.resolveEffectiveSessionMode();

    // Assert
    deepStrictEqual(effective, builtInEffectiveMode());
  });

  it("reads the /mode session default", async () => {
    // Arrange
    const { store, session } = sessionHarness();
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");

    // Act
    const mode = await session.readDefaultPermissionMode();

    // Assert
    strictEqual(mode, "plan");
  });

  it("takes the /mode session default first", async () => {
    // Arrange
    const { store, session } = sessionHarness();
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");

    // Act
    const effective = await session.resolveEffectiveSessionMode();

    // Assert
    deepStrictEqual(effective, { mode: "plan", via: "session default via /mode" });
  });

  it("ignores a stored session default that is not a mode", async () => {
    // Arrange
    const { store, session } = sessionHarness();
    store.state.set(DEFAULT_MODE_STATE_KEY, "yolo");

    // Act
    const mode = await session.readDefaultPermissionMode();

    // Assert
    strictEqual(mode, null);
  });

  it("reads the fallback from the layered config", async () => {
    // Arrange
    const { files, session } = sessionHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ [PERMISSION_FALLBACK_CONFIG_KEY]: "acceptEdits" }));

    // Act
    const fallback = await session.resolveSessionFallbackMode();

    // Assert
    deepStrictEqual(fallback, resolveFallbackMode("acceptEdits"));
  });

  it("takes the fallback of the layered config as the effective mode", async () => {
    // Arrange
    const { files, session } = sessionHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ [PERMISSION_FALLBACK_CONFIG_KEY]: "acceptEdits" }));

    // Act
    const effective = await session.resolveEffectiveSessionMode();

    // Assert
    strictEqual(effective.mode, "acceptEdits");
  });

  it("reads no session default when the store and the config fail", async () => {
    // Arrange
    const session = failingSession();

    // Act
    const mode = await session.readDefaultPermissionMode();

    // Assert
    strictEqual(mode, null);
  });

  it("falls back to the built-in mode when the store and the config fail", async () => {
    // Arrange
    const session = failingSession();

    // Act
    const effective = await session.resolveEffectiveSessionMode();

    // Assert
    deepStrictEqual(effective, builtInEffectiveMode());
  });
});

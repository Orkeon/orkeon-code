// /clear empties the buffer and keeps the permission mode and the /model choice (commands/_lib/session/clear.ts). Run:
//   node --test tests/commands/_lib/session/clear.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { runClear } from "../../../../src/commands/_lib/session/clear.ts";
import { DEFAULT_MODE_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { NOTHING_KEPT_LINE, clearSession } from "./clear.fixtures.ts";

describe("/clear", () => {
  it("keeps the permission mode /mode set", async () => {
    // Arrange
    const session = clearSession({ mode: "bypassPermissions" });

    // Act
    await runClear({ session });

    // Assert
    strictEqual(session.state.get(DEFAULT_MODE_STATE_KEY), "bypassPermissions");
  });

  it("keeps the model /model set", async () => {
    // Arrange
    const session = clearSession({ model: "claude-mythos-5-2" });

    // Act
    await runClear({ session });

    // Assert
    strictEqual(session.state.get(MODEL_PREFERENCE_STATE_KEY), "claude-mythos-5-2");
  });

  it("empties the buffer and the rest of the session state", async () => {
    // Arrange
    const session = clearSession({ mode: "acceptEdits", model: "claude-mythos-5-2" });

    // Act
    await runClear({ session });

    // Assert
    deepStrictEqual([session.messages, [...session.state.keys()].sort()], [[], [DEFAULT_MODE_STATE_KEY, MODEL_PREFERENCE_STATE_KEY].sort()]);
  });

  it("says how many messages it removed and the mode and model it kept", async () => {
    // Arrange
    const session = clearSession({ messages: 4, mode: "bypassPermissions", model: "claude-mythos-5-2" });

    // Act
    const line = await runClear({ session });

    // Assert
    strictEqual(
      line,
      "conversation cleared (4 messages removed). Permission mode kept: bypassPermissions. Model kept: claude-mythos-5-2.",
    );
  });

  it("writes nothing back when neither /mode nor /model set anything", async () => {
    // Arrange
    const session = clearSession({ messages: 2 });

    // Act
    const line = await runClear({ session });

    // Assert
    deepStrictEqual([line, session.state.size], ["conversation cleared (2 messages removed).", 0]);
  });

  it("says what it could not write back when the state cannot be written", async () => {
    // Arrange
    const session = clearSession({ messages: 1, mode: "bypassPermissions", model: "claude-mythos-5-2" });
    session.writeStateFailure = new Error("read-only state");

    // Act
    const line = await runClear({ session });

    // Assert
    strictEqual(line, NOTHING_KEPT_LINE);
  });
});

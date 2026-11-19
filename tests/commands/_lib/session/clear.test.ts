// /clear empties the buffer and keeps the permission mode (commands/_lib/session/clear.ts). Run:
//   node --test tests/commands/_lib/session/clear.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { runClear } from "../../../../src/commands/_lib/session/clear.ts";
import { DEFAULT_MODE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { clearSession } from "./clear.fixtures.ts";

describe("/clear", () => {
  it("keeps the permission mode /mode set", async () => {
    // Arrange
    const session = clearSession({ mode: "bypassPermissions" });

    // Act
    await runClear({ session });

    // Assert
    strictEqual(session.state.get(DEFAULT_MODE_STATE_KEY), "bypassPermissions");
  });

  it("empties the buffer and the rest of the session state", async () => {
    // Arrange
    const session = clearSession({ mode: "acceptEdits" });

    // Act
    await runClear({ session });

    // Assert
    deepStrictEqual([session.messages, [...session.state.keys()]], [[], [DEFAULT_MODE_STATE_KEY]]);
  });

  it("says how many messages it removed and the mode it kept", async () => {
    // Arrange
    const session = clearSession({ messages: 4, mode: "bypassPermissions" });

    // Act
    const line = await runClear({ session });

    // Assert
    strictEqual(line, "conversation cleared (4 messages removed). Permission mode kept: bypassPermissions.");
  });

  it("writes no mode back when /mode set none", async () => {
    // Arrange
    const session = clearSession({ messages: 2 });

    // Act
    const line = await runClear({ session });

    // Assert
    deepStrictEqual([line, session.state.has(DEFAULT_MODE_STATE_KEY)], ["conversation cleared (2 messages removed).", false]);
  });

  it("says the mode was not kept when the state cannot be written", async () => {
    // Arrange
    const session = clearSession({ messages: 1, mode: "bypassPermissions" });
    session.writeStateFailure = new Error("read-only state");

    // Act
    const line = await runClear({ session });

    // Assert
    strictEqual(
      line,
      "conversation cleared (1 messages removed). ⚠ the permission mode bypassPermissions could not be written back: " +
        "the session is on its fallback mode, /mode bypassPermissions sets it again.",
    );
  });
});

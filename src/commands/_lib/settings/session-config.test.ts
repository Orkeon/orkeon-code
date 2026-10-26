// commands/_lib/settings/session-config.ts over FakeSessionStore: the toggle commands
// (/fast, /proactive). Run:
//   node --test src/commands/_lib/settings/session-config.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { FakeSessionStore } from "../../../../tests/support/doubles/fake-session-store.ts";
import { defineToggle, EXPLICIT_CASES, sessionWithFlag, unreadableStateStore } from "./session-config.fixtures.ts";

describe("toggleCommand", () => {
  it("describes the command under its name and description", () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const { descriptor } = defineToggle(session);

    // Assert
    deepStrictEqual(descriptor, { name: "fast", description: "Toggle fast mode." });
  });

  it("flips the flag on from off on a bare press, and says what consumes it", async () => {
    // Arrange
    const session = sessionWithFlag(null);
    const { press } = defineToggle(session);

    // Act
    const text = await press();

    // Assert
    strictEqual(text, "fast: on (turns skip two blocks; /clear clears it).");
    strictEqual(session.state.get("fast_mode"), "true");
  });

  it("flips the flag off from on on a bare press, and says what consumes it", async () => {
    // Arrange
    const session = sessionWithFlag("true");
    const { press } = defineToggle(session);

    // Act
    const text = await press();

    // Assert
    strictEqual(text, "fast: off (turns skip two blocks; /clear clears it).");
    strictEqual(session.state.get("fast_mode"), "false");
  });

  for (const c of EXPLICIT_CASES) {
    it(`sets the flag explicitly with on and off, whatever it was: ${c.name}`, async () => {
      // Arrange
      const session = sessionWithFlag(c.from);
      const { press } = defineToggle(session);

      // Act
      await press(c.raw);

      // Assert
      strictEqual(session.state.get("fast_mode"), c.flag);
    });
  }

  it("reads an unreadable flag as off", async () => {
    // Arrange
    const session = unreadableStateStore();
    const { press } = defineToggle(session);

    // Act
    const text = await press();

    // Assert
    strictEqual(text, "fast: on (turns skip two blocks; /clear clears it).");
    strictEqual(session.state.get("fast_mode"), "true");
  });
});

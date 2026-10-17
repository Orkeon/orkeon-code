// commands/_lib/session-config.ts over FakeSessionStore: the toggle commands
// (/fast, /proactive, /sandbox-toggle). Run:
//   node --test tests/commands-session-config.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { toggleCommand } from "../src/commands/_lib/session-config.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";

/** A session whose state bag cannot be read, but can be written. */
class UnreadableStateStore extends FakeSessionStore {
  async readState(): Promise<string | null> {
    throw new Error("no session tools");
  }
}

const SPEC = { name: "fast", description: "Toggle fast mode.", key: "fast_mode", note: "turns skip two blocks" };

/** The toggle's descriptor, and its handler run against a context whose continue
 *  echoes the text. */
function defineToggle(session: FakeSessionStore) {
  const { handler, ...descriptor } = toggleCommand(SPEC, session);
  const press = (...raw: string[]) => handler({ raw }, { continue: (text: string) => text });
  return { descriptor, press };
}

describe("toggleCommand", () => {
  it("describes the command under its name and description", () => {
    deepStrictEqual(defineToggle(new FakeSessionStore()).descriptor, { name: "fast", description: "Toggle fast mode." });
  });

  it("flips the flag on a bare press, and says what consumes it", async () => {
    const session = new FakeSessionStore();
    const { press } = defineToggle(session);
    strictEqual(await press(), "fast: on (turns skip two blocks; /reset-session clears it).");
    strictEqual(session.state.get("fast_mode"), "true");
    strictEqual(await press(), "fast: off (turns skip two blocks; /reset-session clears it).");
    strictEqual(session.state.get("fast_mode"), "false");
  });

  it("sets the flag explicitly with on and off, whatever it was", async () => {
    const session = new FakeSessionStore();
    const { press } = defineToggle(session);
    await press("ON");
    await press("on");
    strictEqual(session.state.get("fast_mode"), "true");
    await press("off");
    strictEqual(session.state.get("fast_mode"), "false");
  });

  it("reads an unreadable flag as off", async () => {
    const session = new UnreadableStateStore();
    strictEqual(await defineToggle(session).press(), "fast: on (turns skip two blocks; /reset-session clears it).");
    strictEqual(session.state.get("fast_mode"), "true");
  });
});

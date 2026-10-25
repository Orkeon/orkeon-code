// /hooks (A-2): the listing with where the hooks run, an addition stored in the session, the refusal of a command
// the shell tool refuses, a removal. Run:
//   node --test tests/commands-hooks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { HOOKS_STATUS, runHooks } from "../src/commands/_lib/hooks.ts";
import { HOOKS_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { HOOKED_STEPS, PRE_TOOL_HOOK, sessionWithHooks, stored } from "./commands-hooks.fixtures.ts";

describe("/hooks", () => {
  it("lists none, then says where the hooks run: every dev step that takes them", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const r = await runHooks([], session);

    // Assert
    strictEqual(r.table, undefined);
    ok(r.text.startsWith("no hooks configured."), r.text);
    for (const step of HOOKED_STEPS) ok(HOOKS_STATUS.includes(step), step);
  });

  it("stores a hook it adds", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const added = await runHooks(["add", "pre-tool", "node", ".orkeon/hooks/pre.mjs", "{tool}"], session);

    // Assert
    strictEqual(added.text, `hook #1 added on 'pre-tool' (/clear clears). ${HOOKS_STATUS}`);
    deepStrictEqual(stored(session), [PRE_TOOL_HOOK]);
  });

  it("lists a stored hook", async () => {
    // Arrange
    const session = sessionWithHooks([PRE_TOOL_HOOK]);

    // Act
    const listed = await runHooks(["list"], session);

    // Assert
    deepStrictEqual(listed, { table: [{ n: 1, ...PRE_TOOL_HOOK }], text: HOOKS_STATUS });
  });

  it("refuses to remove a hook past the last one", async () => {
    // Arrange
    const session = sessionWithHooks([PRE_TOOL_HOOK]);

    // Act
    const removed = await runHooks(["remove", "2"], session);

    // Assert
    strictEqual(removed.text, "usage: /hooks remove <1-1>");
  });

  it("removes a stored hook", async () => {
    // Arrange
    const session = sessionWithHooks([PRE_TOOL_HOOK]);

    // Act
    const removed = await runHooks(["remove", "1"], session);

    // Assert
    strictEqual(removed.text, "hook #1 removed.");
    deepStrictEqual(stored(session), []);
  });

  it("refuses a command holding a shell operator, storing nothing", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const refused = await runHooks(["add", "post-tool", "npm", "test", "&&", "rm", "x"], session);

    // Assert
    ok(refused.text.startsWith("refused: the command holds '&&'"), refused.text);
    strictEqual(session.state.has(HOOKS_STATE_KEY), false);
  });

  it("refuses an unknown event, storing nothing", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const refused = await runHooks(["add", "later", "npm", "test"], session);

    // Assert
    strictEqual(refused.text, "usage: /hooks add <pre-tool|post-tool|stop> <command>");
    strictEqual(session.state.has(HOOKS_STATE_KEY), false);
  });
});

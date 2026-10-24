// /hooks (A-2): the listing with where the hooks run, an addition stored in the session, the refusal of a command
// the shell tool refuses, a removal. Run:
//   node --test tests/commands-hooks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { HOOKS_STATUS, runHooks } from "../src/commands/_lib/hooks.ts";
import { HOOKS_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";

const stored = (session: FakeSessionStore): unknown => JSON.parse(session.state.get(HOOKS_STATE_KEY) ?? "[]");

describe("/hooks", () => {
  it("lists none, then says where the hooks run: every dev step that takes them", async () => {
    const r = await runHooks([], new FakeSessionStore());
    strictEqual(r.table, undefined);
    ok(r.text.startsWith("no hooks configured."), r.text);
    for (const step of ["/dev-spec", "/dev-change", "/dev-plan", "/dev-implement", "/dev-batches", "/dev-verify", "/tasks repair"]) ok(HOOKS_STATUS.includes(step), step);
  });

  it("stores a hook, lists it, and removes it", async () => {
    const session = new FakeSessionStore();
    const added = await runHooks(["add", "pre-tool", "node", ".orkeon/hooks/pre.mjs", "{tool}"], session);
    strictEqual(added.text, `hook #1 added on 'pre-tool' (/clear clears). ${HOOKS_STATUS}`);
    deepStrictEqual(stored(session), [{ event: "pre-tool", command: "node .orkeon/hooks/pre.mjs {tool}" }]);
    deepStrictEqual(await runHooks(["list"], session), {
      table: [{ n: 1, event: "pre-tool", command: "node .orkeon/hooks/pre.mjs {tool}" }], text: HOOKS_STATUS,
    });
    strictEqual((await runHooks(["remove", "2"], session)).text, "usage: /hooks remove <1-1>");
    strictEqual((await runHooks(["remove", "1"], session)).text, "hook #1 removed.");
    deepStrictEqual(stored(session), []);
  });

  it("refuses a command holding a shell operator, and an unknown event, storing nothing", async () => {
    const session = new FakeSessionStore();
    const refused = await runHooks(["add", "post-tool", "npm", "test", "&&", "rm", "x"], session);
    ok(refused.text.startsWith("refused: the command holds '&&'"), refused.text);
    strictEqual((await runHooks(["add", "later", "npm", "test"], session)).text, "usage: /hooks add <pre-tool|post-tool|stop> <command>");
    strictEqual(session.state.has(HOOKS_STATE_KEY), false);
  });
});

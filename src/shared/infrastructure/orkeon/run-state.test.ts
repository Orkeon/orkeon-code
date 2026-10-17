// The RunState adapter over a FakeAgentContext. Run:
//   node_modules/.bin/tsx --test shared/infrastructure/orkeon/run-state.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { createRunState } from "./run-state.ts";
import { FakeAgentContext } from "../../../../tests/support/fake-agent-context.ts";

describe("createRunState", () => {
  it("reads a field of the agent state, undefined when unset", () => {
    const ctx = new FakeAgentContext();
    ctx.fields = { consecutiveFailures: 2 };
    const run = createRunState(ctx);
    strictEqual(run.read("consecutiveFailures"), 2);
    strictEqual(run.read("missing"), undefined);
  });

  it("writes one field through the state's mutator, keeping the others", async () => {
    const ctx = new FakeAgentContext();
    ctx.fields = { permissionMode: "plan", consecutiveFailures: 0 };
    await createRunState(ctx).write("consecutiveFailures", 3);
    deepStrictEqual(ctx.fields, { permissionMode: "plan", consecutiveFailures: 3 });
    strictEqual(ctx.mutations, 1);
  });

  it("reads the state the last write left", async () => {
    const ctx = new FakeAgentContext();
    const run = createRunState(ctx);
    await run.write("consecutiveFailures", 1);
    strictEqual(run.read("consecutiveFailures"), 1);
  });
});

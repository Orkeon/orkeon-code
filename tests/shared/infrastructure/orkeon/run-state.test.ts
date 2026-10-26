// The RunState adapter over a FakeAgentContext. Run:
//   node --test tests/shared/infrastructure/orkeon/run-state.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { createRunState } from "../../../../src/shared/infrastructure/orkeon/run-state.ts";
import { FakeAgentContext } from "../../../support/doubles/fake-agent-context.ts";

describe("createRunState", () => {
  it("reads a field of the agent state", () => {
    // Arrange
    const ctx = new FakeAgentContext();
    ctx.fields = { consecutiveFailures: 2 };

    // Act
    const value = createRunState(ctx).read("consecutiveFailures");

    // Assert
    strictEqual(value, 2);
  });

  it("reads undefined for a field that is unset", () => {
    // Arrange
    const ctx = new FakeAgentContext();
    ctx.fields = { consecutiveFailures: 2 };

    // Act
    const value = createRunState(ctx).read("missing");

    // Assert
    strictEqual(value, undefined);
  });

  it("writes one field through the state's mutator, keeping the others", async () => {
    // Arrange
    const ctx = new FakeAgentContext();
    ctx.fields = { permissionMode: "plan", consecutiveFailures: 0 };

    // Act
    await createRunState(ctx).write("consecutiveFailures", 3);

    // Assert
    deepStrictEqual(ctx.fields, { permissionMode: "plan", consecutiveFailures: 3 });
    strictEqual(ctx.mutations, 1);
  });

  it("reads the state the last write left", async () => {
    // Arrange
    const run = createRunState(new FakeAgentContext());
    await run.write("consecutiveFailures", 1);

    // Act
    const value = run.read("consecutiveFailures");

    // Assert
    strictEqual(value, 1);
  });
});

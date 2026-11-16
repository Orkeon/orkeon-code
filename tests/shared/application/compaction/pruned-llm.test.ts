// The Llm whose acts carry the pruning of their tool loop, over fakes. Run:
//   node --test tests/shared/application/compaction/pruned-llm.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { prunedLlm } from "../../../../src/shared/application/compaction/pruned-llm.ts";
import { BINDING, BOUND_REQUEST, BRIEF, REQUEST, bindingOf, failingPrune, inlineLlm } from "./pruned-llm.fixtures.ts";

describe("prunedLlm", () => {
  it("sends an act its request with the binding of the pruning", async () => {
    // Arrange
    const llm = inlineLlm();
    const { prune } = bindingOf(BINDING);

    // Act
    await prunedLlm(llm, prune).act(BRIEF, REQUEST);

    // Assert
    deepStrictEqual(llm.acts, [{ prompt: BRIEF, request: { ...REQUEST, ...BINDING } }]);
  });

  it("asks for the binding on the act's prompt", async () => {
    // Arrange
    const { prune, asked } = bindingOf(BINDING);

    // Act
    await prunedLlm(inlineLlm(), prune).act(BRIEF, REQUEST);

    // Assert
    deepStrictEqual(asked, [BRIEF]);
  });

  it("answers what the act answered", async () => {
    // Arrange
    const { prune } = bindingOf(BINDING);

    // Act
    const reply = await prunedLlm(inlineLlm(), prune).act(BRIEF, REQUEST);

    // Assert
    strictEqual(reply, "done");
  });

  it("sends the request as it came when the pruning is off", async () => {
    // Arrange
    const llm = inlineLlm();
    const { prune } = bindingOf({});

    // Act
    await prunedLlm(llm, prune).act(BRIEF, REQUEST);

    // Assert
    strictEqual(llm.acts[0].request, REQUEST);
  });

  it("sends the request as it came when the binding cannot be made", async () => {
    // Arrange
    const llm = inlineLlm();

    // Act
    await prunedLlm(llm, failingPrune).act(BRIEF, REQUEST);

    // Assert
    strictEqual(llm.acts[0].request, REQUEST);
  });

  it("leaves a request that carries a callback of its own", async () => {
    // Arrange
    const llm = inlineLlm();
    const { prune } = bindingOf(BINDING);

    // Act
    await prunedLlm(llm, prune).act(BRIEF, BOUND_REQUEST);

    // Assert
    strictEqual(llm.acts[0].request, BOUND_REQUEST);
  });

  it("asks for no binding on a request that carries a callback of its own", async () => {
    // Arrange
    const { prune, asked } = bindingOf(BINDING);

    // Act
    await prunedLlm(inlineLlm(), prune).act(BRIEF, BOUND_REQUEST);

    // Assert
    deepStrictEqual(asked, []);
  });

  it("asks for no binding on an extraction", async () => {
    // Arrange
    const { prune, asked } = bindingOf(BINDING);

    // Act
    await prunedLlm(inlineLlm(), prune).extract("the verdict", { type: "object" });

    // Assert
    deepStrictEqual(asked, []);
  });

  it("hands an extraction to the Llm as it came", async () => {
    // Arrange
    const llm = inlineLlm();
    const { prune } = bindingOf(BINDING);

    // Act
    const value = await prunedLlm(llm, prune).extract("the verdict", { type: "object" });

    // Assert
    deepStrictEqual(value, { verdict: "CLEAR" });
  });

  it("hands a completion to the Llm as it came", async () => {
    // Arrange
    const llm = inlineLlm();
    const { prune } = bindingOf(BINDING);

    // Act
    await prunedLlm(llm, prune).complete("one line", { system: "S" });

    // Assert
    deepStrictEqual(llm.completes, [{ prompt: "one line", override: { system: "S" } }]);
  });

  it("says of the permission gate what the Llm says", () => {
    // Arrange
    const llm = inlineLlm();
    llm.gateEnabled = false;

    // Act
    const enabled = prunedLlm(llm, failingPrune).permissionGateEnabled();

    // Assert
    strictEqual(enabled, false);
  });
});

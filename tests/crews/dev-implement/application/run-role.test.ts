// One act of a role. Run:
//   node --test tests/crews/dev-implement/application/run-role.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { TEST_AUTHOR } from "../../../../src/crews/dev-implement/domain/roles.ts";
import { runRole } from "../../../../src/crews/dev-implement/application/run-role.ts";
import { BUDGET_EXHAUSTED_MESSAGE, budgetExhaustedAnswer } from "../../../../src/shared/domain/llm-failure.ts";

describe("runRole", () => {
  it("acts with the role's tools, system and acceptEdits", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = ["done"];

    // Act
    const result = await runRole(llm, TEST_AUTHOR, "brief");

    // Assert
    deepStrictEqual(result, { ok: true, text: "done" });
    deepStrictEqual(llm.acts[0].request, {
      system: TEST_AUTHOR.system, maxIterations: TEST_AUTHOR.maxIterations, tools: TEST_AUTHOR.tools, permissionMode: "acceptEdits",
    });
  });

  it("stops the role on the wrap-up of a spent token budget, never taking it for the role's answer (Orkeon #218)", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = [budgetExhaustedAnswer("I edited half the file")];

    // Act
    const result = await runRole(llm, TEST_AUTHOR, "brief");

    // Assert
    deepStrictEqual(result, { ok: false, reason: `test-author: ${BUDGET_EXHAUSTED_MESSAGE}` });
  });

  it("answers a failed act as its reason", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = [new Error("tool-call budget exhausted\nmore")];

    // Act
    const result = await runRole(llm, TEST_AUTHOR, "brief");

    // Assert
    deepStrictEqual(result, { ok: false, reason: "test-author: tool-call budget exhausted" });
  });
});
